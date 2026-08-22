import type {
  TaskMapCalendarProducerResultV1,
} from "../src/engine/taskmap/calendar-producer-freshness.js";
import {
  refreshTaskMapCalendarExtraction,
  type TaskMapCalendarExtractionReportV1,
} from "../src/engine/taskmap/calendar-refresh-llm-replay.js";
import type {
  LlmStation,
  LlmStationEnvelope,
} from "../src/engine/taskmap/llm-station.js";
import { taskMapContractDigest } from
  "../src/engine/taskmap/source-contracts.js";

export async function refreshCalendarExtractionFixture(input: {
  result: TaskMapCalendarProducerResultV1;
  taskMapRoot: string;
  runtimeRoot: string;
  promptTemplatePath: string;
  assessedAt: string;
}): Promise<TaskMapCalendarExtractionReportV1> {
  const createStation = async (): Promise<LlmStation> => ({
    provider: {
      transport: "claude-cli",
      executable: "/fixture/provider",
      args: [],
      model: "fixture-model",
    },
    async run(request): Promise<LlmStationEnvelope> {
      const event = input.result.events.find((candidate) =>
        request.promptText.includes(candidate.title)
      );
      if (event === undefined) {
        throw new Error("calendar fixture station segment is inconsistent");
      }
      return {
        stationId: "mention-extraction-v1",
        model: "fixture-model",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: JSON.stringify({
          mentions: [{
            text: event.title,
            title: event.title,
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
  return refreshTaskMapCalendarExtraction({
    result: input.result,
    taskMapRoot: input.taskMapRoot,
    runtimeRoot: input.runtimeRoot,
    ownerScopeDigest: input.result.ownerScopeDigest,
    promptTemplatePath: input.promptTemplatePath,
    assessedAt: input.assessedAt,
    createStation,
  });
}
