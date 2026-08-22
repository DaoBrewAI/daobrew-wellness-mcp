import type {
  TaskMapAgentSessionSemanticAdmissionV2,
} from "../src/engine/taskmap/agent-session-semantic-admission.js";
import type {
  TaskMapAgentSessionExtractionReportV1,
} from "../src/engine/taskmap/agent-session-refresh-llm-replay.js";
import {
  refreshTaskMapAgentSessionExtraction,
} from "../src/engine/taskmap/agent-session-refresh-llm-replay.js";
import type {
  LlmStation,
  LlmStationEnvelope,
} from "../src/engine/taskmap/llm-station.js";
import { taskMapMeetingObligationGate } from
  "../src/engine/taskmap/meeting-producer-freshness.js";
import { taskMapContractDigest } from
  "../src/engine/taskmap/source-contracts.js";

export function buildAgentSessionExtractionFixture(
  admission: TaskMapAgentSessionSemanticAdmissionV2,
  assessedAt: string,
): TaskMapAgentSessionExtractionReportV1 {
  const gate = taskMapMeetingObligationGate("request", "self");
  const clusters = admission.clusters.map((cluster) => ({
    clusterIdentityDigest: cluster.clusterIdentityDigest,
    workstreamIdentityDigest: cluster.workstreamIdentityDigest,
    inputDigest: taskMapContractDigest({
      fixture: "agent-extraction-input",
      clusterIdentityDigest: cluster.clusterIdentityDigest,
    }),
    status: "extracted" as const,
    degradationCode: null,
    envelopeDigest: taskMapContractDigest({
      fixture: "agent-extraction-envelope",
      clusterIdentityDigest: cluster.clusterIdentityDigest,
    }),
    envelopeModel: "fixture-model",
    envelopeTransport: "claude-cli" as const,
    mentions: [{
      text: cluster.assistantOutcomeSummary ?? cluster.userDirectiveSummary,
      title: cluster.userDirectiveSummary,
      speechActClass: "request" as const,
      speechActActor: "self" as const,
      confidence: 0.9,
      mentionIdentityDigest: taskMapContractDigest({
        fixture: "agent-extraction-mention",
        clusterIdentityDigest: cluster.clusterIdentityDigest,
      }),
      proposalDisposition: gate.proposalDisposition,
      promotionEligible: gate.promotionEligible,
    }],
  }));
  const base = {
    contractVersion: "taskmap-agent-session-extraction-report.v1" as const,
    ownerScopeDigest: admission.ownerScopeDigest,
    admissionDigest: admission.admissionDigest,
    promptTemplateDigest: taskMapContractDigest("fixture-agent-prompt"),
    assessedAt,
    clusters,
    pendingCount: 0,
  };
  return {
    ...base,
    reportDigest: taskMapContractDigest(base),
  };
}

export async function refreshAgentSessionExtractionFixture(input: {
  admission: TaskMapAgentSessionSemanticAdmissionV2;
  taskMapRoot: string;
  runtimeRoot: string;
  promptTemplatePath: string;
  assessedAt: string;
}): Promise<TaskMapAgentSessionExtractionReportV1> {
  const ordered = [...input.admission.clusters].sort((left, right) =>
    left.clusterIdentityDigest.localeCompare(right.clusterIdentityDigest)
  );
  let runIndex = 0;
  const createStation = async (): Promise<LlmStation> => ({
    provider: {
      transport: "claude-cli",
      executable: "/fixture/provider",
      args: [],
      model: "fixture-model",
    },
    async run(request): Promise<LlmStationEnvelope> {
      const cluster = ordered[runIndex++];
      if (
        cluster === undefined
        || !request.promptText.includes(cluster.userDirectiveSummary)
      ) throw new Error("fixture station cluster order is inconsistent");
      return {
        stationId: "mention-extraction-v1",
        model: "fixture-model",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: JSON.stringify({
          mentions: [{
            text: cluster.userDirectiveSummary,
            title: cluster.userDirectiveSummary,
            class: "request",
            actor: "self",
            confidence: 0.9,
          }],
        }),
        producedAt: input.assessedAt,
        transport: "claude-cli",
      };
    },
  });
  return refreshTaskMapAgentSessionExtraction({
    admission: input.admission,
    taskMapRoot: input.taskMapRoot,
    runtimeRoot: input.runtimeRoot,
    ownerScopeDigest: input.admission.ownerScopeDigest,
    promptTemplatePath: input.promptTemplatePath,
    assessedAt: input.assessedAt,
    createStation,
  });
}
