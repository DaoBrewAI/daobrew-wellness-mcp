import {
  lstat,
} from "node:fs/promises";
import path from "node:path";

import {
  renderTaskMapAgentSessionMentionPrompt,
  taskMapAgentSessionExtractionBody,
} from "./agent-session-extraction.js";
import {
  assertTaskMapAgentSessionSemanticAdmission,
  type TaskMapAgentSessionProposalClusterV2,
  type TaskMapAgentSessionSemanticAdmissionV2,
} from "./agent-session-semantic-admission.js";
import {
  LLM_STATION_ID,
  createLlmStation,
  type LlmStation,
  type LlmStationEnvelope,
} from "./llm-station.js";
import {
  assertTaskMapStrictJsonSyntaxAndUniqueKeys,
  validateMentionExtraction,
  type MentionActor,
  type MentionSpeechActClass,
} from "./mention-extraction.js";
import {
  normalizeMentionText,
} from "./mention-normalization.js";
import {
  TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES,
  TaskMapMeetingExtractionUnavailableError,
  TaskMapPromptTemplateUnavailableError,
  assertPrivateDirectory,
  atomicPrivateWriteNew,
  loadEnvelope,
  readAuthenticatedFile,
  readPromptTemplate,
  replacePrivateFile,
  stationDegradationCode,
  taskMapMentionExtractionEnvelopePath,
  validateEnvelope,
  type TaskMapLlmStationFactory,
  type TaskMapMeetingExtractionDegradationCode,
} from "./meeting-refresh-llm-replay.js";
import {
  taskMapMeetingObligationGate,
} from "./meeting-producer-freshness.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION =
  "taskmap-agent-session-extraction-report.v1" as const;
export const TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME =
  "taskmap-agent-session-extraction-report.v1.json" as const;
export const TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE =
  "agent-session" as const;
export const TASKMAP_AGENT_SESSION_MENTION_IDENTITY_DOMAIN =
  "taskmap-agent-session-mention-identity.1" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const REPORT_KEYS = new Set([
  "contractVersion",
  "ownerScopeDigest",
  "admissionDigest",
  "promptTemplateDigest",
  "assessedAt",
  "clusters",
  "pendingCount",
  "reportDigest",
]);
const CLUSTER_KEYS = new Set([
  "clusterIdentityDigest",
  "workstreamIdentityDigest",
  "inputDigest",
  "status",
  "degradationCode",
  "envelopeDigest",
  "envelopeModel",
  "envelopeTransport",
  "mentions",
]);
const MENTION_KEYS = new Set([
  "text",
  "title",
  "speechActClass",
  "speechActActor",
  "confidence",
  "mentionIdentityDigest",
  "proposalDisposition",
  "promotionEligible",
]);
const SPEECH_ACT_CLASSES = new Set<MentionSpeechActClass>([
  "request",
  "commitment",
  "decision",
  "other",
]);
const SPEECH_ACT_ACTORS = new Set<MentionActor>([
  "self",
  "other",
  "unknown",
]);

export interface TaskMapAgentSessionExtractionMentionV1 {
  text: string;
  title: string;
  speechActClass: MentionSpeechActClass;
  speechActActor: MentionActor;
  confidence: number;
  mentionIdentityDigest: string;
  proposalDisposition: "context_only" | "candidate_only";
  promotionEligible: boolean;
}

export interface TaskMapAgentSessionExtractionClusterV1 {
  clusterIdentityDigest: string;
  workstreamIdentityDigest: string;
  inputDigest: string;
  status: "extracted" | "degraded";
  degradationCode: TaskMapMeetingExtractionDegradationCode | null;
  envelopeDigest: string | null;
  envelopeModel: string | null;
  envelopeTransport: "claude-cli" | "codex-cli" | "gemini-remote" | null;
  mentions: TaskMapAgentSessionExtractionMentionV1[];
}

export interface TaskMapAgentSessionExtractionReportV1 {
  contractVersion: typeof TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION;
  ownerScopeDigest: string;
  admissionDigest: string;
  promptTemplateDigest: string;
  assessedAt: string;
  clusters: TaskMapAgentSessionExtractionClusterV1[];
  pendingCount: number;
  reportDigest: string;
}

export interface RefreshTaskMapAgentSessionExtractionInputV1 {
  admission: TaskMapAgentSessionSemanticAdmissionV2;
  taskMapRoot: string;
  runtimeRoot: string;
  ownerScopeDigest: string;
  promptTemplatePath: string;
  assessedAt: string;
  createStation?: TaskMapLlmStationFactory;
  signal?: AbortSignal;
  persist?: boolean;
}

export interface LoadVerifiedTaskMapAgentSessionExtractionReportInputV1 {
  admission: TaskMapAgentSessionSemanticAdmissionV2;
  taskMapRoot: string;
  runtimeRoot: string;
  ownerScopeDigest: string;
  promptTemplatePath: string;
}

function unavailable(code: string, cause?: unknown): never {
  const error = new TaskMapMeetingExtractionUnavailableError(code);
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !STRICT_RFC3339.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function envelopeDigest(envelope: LlmStationEnvelope): string {
  return taskMapContractDigest(envelope);
}

function reportEnvelopeTransport(
  envelope: LlmStationEnvelope,
): "claude-cli" | "codex-cli" | "gemini-remote" {
  if (
    envelope.transport !== "claude-cli"
    && envelope.transport !== "codex-cli"
    && envelope.transport !== "gemini-remote"
  ) unavailable("invalid_extraction_output");
  return envelope.transport;
}

function mentionsFromEnvelope(
  envelope: LlmStationEnvelope,
  body: string,
): TaskMapAgentSessionExtractionMentionV1[] {
  const byIdentity = new Map<string, {
    representative: ReturnType<typeof validateMentionExtraction>["mentions"][number];
    promotionEligible: boolean;
  }>();
  for (const mention of validateMentionExtraction(envelope.outputJson, body).mentions) {
    const mentionIdentityDigest = taskMapContractDigest({
      domain: TASKMAP_AGENT_SESSION_MENTION_IDENTITY_DOMAIN,
      normalizedText: normalizeMentionText(mention.text),
    });
    const gate = taskMapMeetingObligationGate(mention.class, mention.actor);
    const current = byIdentity.get(mentionIdentityDigest);
    if (current === undefined) {
      byIdentity.set(mentionIdentityDigest, {
        representative: mention,
        promotionEligible: gate.promotionEligible,
      });
      continue;
    }
    current.promotionEligible &&= gate.promotionEligible;
    if (mention.confidence > current.representative.confidence) {
      current.representative = mention;
    }
  }
  return [...byIdentity.entries()].map(([
    mentionIdentityDigest,
    folded,
  ]) => {
    const mention = folded.representative;
    const gate = taskMapMeetingObligationGate(mention.class, mention.actor);
    return Object.freeze({
      text: mention.text,
      title: mention.title,
      speechActClass: mention.class,
      speechActActor: mention.actor,
      confidence: mention.confidence,
      mentionIdentityDigest,
      proposalDisposition: gate.proposalDisposition,
      promotionEligible: folded.promotionEligible,
    });
  });
}

function degradedRow(
  cluster: TaskMapAgentSessionProposalClusterV2,
  inputDigest: string,
  degradationCode: TaskMapMeetingExtractionDegradationCode,
): TaskMapAgentSessionExtractionClusterV1 {
  return {
    clusterIdentityDigest: cluster.clusterIdentityDigest,
    workstreamIdentityDigest: cluster.workstreamIdentityDigest,
    inputDigest,
    status: "degraded",
    degradationCode,
    envelopeDigest: null,
    envelopeModel: null,
    envelopeTransport: null,
    mentions: [],
  };
}

function extractionFailureCode(
  error: unknown,
): TaskMapMeetingExtractionDegradationCode {
  if (error instanceof TaskMapMeetingExtractionUnavailableError) {
    if (error.code === "invalid_extraction_output") {
      return "invalid_extraction_output";
    }
    if (error.code === "envelope_tampered") return "envelope_tampered";
    return "envelope_store_unavailable";
  }
  return stationDegradationCode(error);
}

function finalizeReport(
  report: Omit<TaskMapAgentSessionExtractionReportV1, "reportDigest">,
): TaskMapAgentSessionExtractionReportV1 {
  return deepFreeze({
    ...report,
    reportDigest: taskMapContractDigest(report),
  });
}

function parseReport(bytes: Buffer): TaskMapAgentSessionExtractionReportV1 {
  let decoded: string;
  let value: unknown;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assertTaskMapStrictJsonSyntaxAndUniqueKeys(decoded);
    value = JSON.parse(decoded);
  } catch (error) {
    unavailable("agent_session_extraction_report_malformed", error);
  }
  if (!isRecord(value) || !hasExactKeys(value, REPORT_KEYS)) {
    unavailable("agent_session_extraction_report_malformed");
  }
  if (
    value.contractVersion !== TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION
    || typeof value.ownerScopeDigest !== "string"
    || !SHA256.test(value.ownerScopeDigest)
    || typeof value.admissionDigest !== "string"
    || !SHA256.test(value.admissionDigest)
    || typeof value.promptTemplateDigest !== "string"
    || !SHA256.test(value.promptTemplateDigest)
    || !validTimestamp(value.assessedAt)
    || !Array.isArray(value.clusters)
    || value.clusters.length > 24
    || !Number.isSafeInteger(value.pendingCount)
    || (value.pendingCount as number) < 0
    || typeof value.reportDigest !== "string"
    || !SHA256.test(value.reportDigest)
  ) {
    unavailable("agent_session_extraction_report_malformed");
  }
  const seenClusters = new Set<string>();
  let degradedCount = 0;
  let previousIdentity = "";
  for (const row of value.clusters) {
    if (!isRecord(row) || !hasExactKeys(row, CLUSTER_KEYS)) {
      unavailable("agent_session_extraction_report_malformed");
    }
    if (
      typeof row.clusterIdentityDigest !== "string"
      || !SHA256.test(row.clusterIdentityDigest)
      || typeof row.workstreamIdentityDigest !== "string"
      || !SHA256.test(row.workstreamIdentityDigest)
      || typeof row.inputDigest !== "string"
      || !SHA256.test(row.inputDigest)
      || seenClusters.has(row.clusterIdentityDigest)
      || row.clusterIdentityDigest <= previousIdentity
      || (row.status !== "extracted" && row.status !== "degraded")
      || !Array.isArray(row.mentions)
      || row.mentions.length > 20
    ) {
      unavailable("agent_session_extraction_report_malformed");
    }
    seenClusters.add(row.clusterIdentityDigest);
    previousIdentity = row.clusterIdentityDigest;
    if (row.status === "degraded") degradedCount += 1;
    if (row.status === "extracted") {
      if (
        row.degradationCode !== null
        || typeof row.envelopeDigest !== "string"
        || !SHA256.test(row.envelopeDigest)
        || typeof row.envelopeModel !== "string"
        || row.envelopeModel.length === 0
        || row.envelopeModel.length > 256
        || (row.envelopeTransport !== "claude-cli"
          && row.envelopeTransport !== "codex-cli"
          && row.envelopeTransport !== "gemini-remote")
      ) unavailable("agent_session_extraction_report_malformed");
    } else if (
      typeof row.degradationCode !== "string"
      || row.envelopeDigest !== null
      || row.envelopeModel !== null
      || row.envelopeTransport !== null
      || row.mentions.length !== 0
    ) {
      unavailable("agent_session_extraction_report_malformed");
    }
    const seenMentionIdentities = new Set<string>();
    for (const mention of row.mentions) {
      if (!isRecord(mention) || !hasExactKeys(mention, MENTION_KEYS)) {
        unavailable("agent_session_extraction_report_malformed");
      }
      if (
        typeof mention.text !== "string"
        || mention.text.length === 0
        || typeof mention.title !== "string"
        || mention.title.length === 0
        || !SPEECH_ACT_CLASSES.has(
          mention.speechActClass as MentionSpeechActClass,
        )
        || !SPEECH_ACT_ACTORS.has(mention.speechActActor as MentionActor)
        || typeof mention.confidence !== "number"
        || !Number.isFinite(mention.confidence)
        || mention.confidence < 0
        || mention.confidence > 1
        || typeof mention.mentionIdentityDigest !== "string"
        || !SHA256.test(mention.mentionIdentityDigest)
        || (mention.proposalDisposition !== "candidate_only"
          && mention.proposalDisposition !== "context_only")
        || typeof mention.promotionEligible !== "boolean"
      ) unavailable("agent_session_extraction_report_malformed");
      if (seenMentionIdentities.has(mention.mentionIdentityDigest)) {
        unavailable("agent_session_extraction_report_malformed");
      }
      seenMentionIdentities.add(mention.mentionIdentityDigest);
    }
  }
  if (degradedCount !== value.pendingCount) {
    unavailable("agent_session_extraction_report_malformed");
  }
  const { reportDigest, ...payload } = value;
  if (taskMapContractDigest(payload) !== reportDigest) {
    unavailable("agent_session_extraction_report_tampered");
  }
  return value as unknown as TaskMapAgentSessionExtractionReportV1;
}

export async function refreshTaskMapAgentSessionExtraction(
  input: RefreshTaskMapAgentSessionExtractionInputV1,
): Promise<TaskMapAgentSessionExtractionReportV1> {
  const assertNotAborted = (): void => {
    if (input.signal?.aborted) unavailable("extraction_aborted");
  };
  assertNotAborted();
  assertTaskMapAgentSessionSemanticAdmission(input.admission);
  if (
    !SHA256.test(input.ownerScopeDigest)
    || input.admission.ownerScopeDigest !== input.ownerScopeDigest
  ) unavailable("owner_scope_invalid");
  if (!validTimestamp(input.assessedAt)) unavailable("assessed_at_invalid");
  await assertPrivateDirectory(input.runtimeRoot, false);
  let template: Awaited<ReturnType<typeof readPromptTemplate>>;
  try {
    template = await readPromptTemplate(input.promptTemplatePath);
  } catch (error) {
    throw new TaskMapPromptTemplateUnavailableError({ cause: error });
  }
  const createStation = input.createStation
    ?? ((signal?: AbortSignal) => createLlmStation({ signal }));
  let stationPromise: Promise<LlmStation> | undefined;
  const clusters: TaskMapAgentSessionExtractionClusterV1[] = [];
  const sortedClusters = [...input.admission.clusters].sort((left, right) =>
    left.clusterIdentityDigest.localeCompare(right.clusterIdentityDigest)
  );

  for (const cluster of sortedClusters) {
    const body = taskMapAgentSessionExtractionBody(cluster);
    const rendered = renderTaskMapAgentSessionMentionPrompt(template.bytes, body);
    let envelope: LlmStationEnvelope | null;
    try {
      envelope = await loadEnvelope(
        input.taskMapRoot,
        rendered,
        body,
        TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
      );
    } catch (error) {
      clusters.push(degradedRow(
        cluster,
        rendered.inputDigest,
        extractionFailureCode(error),
      ));
      continue;
    }
    let mentions = envelope === null
      ? null
      : mentionsFromEnvelope(envelope, body);
    const healingPersistedEnvelope = envelope !== null
      && mentions !== null
      && mentions.length === 0;
    if (envelope === null || healingPersistedEnvelope) {
      stationPromise ??= createStation(input.signal);
      let station: LlmStation;
      try {
        station = await stationPromise;
      } catch (error) {
        clusters.push(degradedRow(
          cluster,
          rendered.inputDigest,
          stationDegradationCode(error),
        ));
        continue;
      }
      try {
        assertNotAborted();
        const candidate = await station.run({
          stationId: LLM_STATION_ID,
          promptText: rendered.promptText,
          inputDigest: rendered.inputDigest,
          signal: input.signal,
        });
        assertNotAborted();
        envelope = validateEnvelope(
          candidate,
          rendered,
          body,
          "invalid_extraction_output",
        );
        mentions = mentionsFromEnvelope(envelope, body);
        if (mentions.length === 0) unavailable("invalid_extraction_output");
        const envelopePath = taskMapMentionExtractionEnvelopePath(
          input.taskMapRoot,
          rendered.inputDigest,
          TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
        );
        if (input.persist !== false) {
          assertNotAborted();
          if (healingPersistedEnvelope) {
            await replacePrivateFile(envelopePath, envelope);
          } else {
            await atomicPrivateWriteNew(envelopePath, envelope);
          }
          assertNotAborted();
          const durable = await loadEnvelope(
            input.taskMapRoot,
            rendered,
            body,
            TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
          );
          if (durable === null) unavailable("envelope_store_unavailable");
          envelope = durable;
          mentions = mentionsFromEnvelope(envelope, body);
          if (mentions.length === 0) unavailable("envelope_store_unavailable");
        }
      } catch (error) {
        clusters.push(degradedRow(
          cluster,
          rendered.inputDigest,
          extractionFailureCode(error),
        ));
        continue;
      }
    }
    if (envelope === null || mentions === null || mentions.length === 0) {
      clusters.push(degradedRow(
        cluster,
        rendered.inputDigest,
        "invalid_extraction_output",
      ));
      continue;
    }
    clusters.push({
      clusterIdentityDigest: cluster.clusterIdentityDigest,
      workstreamIdentityDigest: cluster.workstreamIdentityDigest,
      inputDigest: rendered.inputDigest,
      status: "extracted",
      degradationCode: null,
      envelopeDigest: envelopeDigest(envelope),
      envelopeModel: envelope.model,
      envelopeTransport: reportEnvelopeTransport(envelope),
      mentions,
    });
  }

  const report = finalizeReport({
    contractVersion: TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    admissionDigest: input.admission.admissionDigest,
    promptTemplateDigest: template.digest,
    assessedAt: input.assessedAt,
    clusters,
    pendingCount: clusters.filter((row) => row.status === "degraded").length,
  });
  assertNotAborted();
  if (input.persist === false) return report;
  await replacePrivateFile(
    path.join(
      input.runtimeRoot,
      TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME,
    ),
    report,
  );
  const verified = await loadVerifiedTaskMapAgentSessionExtractionReport({
    admission: input.admission,
    taskMapRoot: input.taskMapRoot,
    runtimeRoot: input.runtimeRoot,
    ownerScopeDigest: input.ownerScopeDigest,
    promptTemplatePath: input.promptTemplatePath,
  });
  if (verified === null) unavailable("agent_session_extraction_report_stale");
  return verified;
}

export async function loadVerifiedTaskMapAgentSessionExtractionReport(
  input: LoadVerifiedTaskMapAgentSessionExtractionReportInputV1,
): Promise<TaskMapAgentSessionExtractionReportV1 | null> {
  assertTaskMapAgentSessionSemanticAdmission(input.admission);
  if (
    !SHA256.test(input.ownerScopeDigest)
    || input.admission.ownerScopeDigest !== input.ownerScopeDigest
  ) unavailable("owner_scope_invalid");
  const reportPath = path.join(
    input.runtimeRoot,
    TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME,
  );
  try {
    await lstat(reportPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    unavailable("agent_session_extraction_report_unavailable", error);
  }
  const [template, reportFile] = await Promise.all([
    readPromptTemplate(input.promptTemplatePath),
    readAuthenticatedFile(
      reportPath,
      TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES,
      "owner_private",
    ),
  ]);
  const report = parseReport(reportFile.bytes);
  if (
    report.ownerScopeDigest !== input.ownerScopeDigest
    || report.admissionDigest !== input.admission.admissionDigest
    || report.promptTemplateDigest !== template.digest
  ) return null;
  if (report.clusters.length !== input.admission.clusters.length) return null;
  const clusterByIdentity = new Map(input.admission.clusters.map((cluster) => [
    cluster.clusterIdentityDigest,
    cluster,
  ] as const));
  for (const row of report.clusters) {
    const cluster = clusterByIdentity.get(row.clusterIdentityDigest);
    if (
      cluster === undefined
      || row.workstreamIdentityDigest !== cluster.workstreamIdentityDigest
    ) return null;
    const body = taskMapAgentSessionExtractionBody(cluster);
    const rendered = renderTaskMapAgentSessionMentionPrompt(template.bytes, body);
    if (row.inputDigest !== rendered.inputDigest) return null;
    if (row.status === "extracted") {
      const envelope = await loadEnvelope(
        input.taskMapRoot,
        rendered,
        body,
        TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
      );
      if (
        envelope === null
        || row.envelopeDigest !== envelopeDigest(envelope)
        || row.envelopeModel !== envelope.model
        || row.envelopeTransport !== envelope.transport
        || taskMapContractCanonicalJson(row.mentions)
          !== taskMapContractCanonicalJson(mentionsFromEnvelope(envelope, body))
      ) unavailable("agent_session_extraction_report_tampered");
    }
  }
  return deepFreeze(report);
}
