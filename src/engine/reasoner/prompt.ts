import { ReasoningInput } from "./types.js";

export function buildReasonerPrompt(input: ReasoningInput): string {
  const rows = input.triplets.map((triplet) => {
    const meetingTitles = triplet.meetings.map((meeting) => meeting.title).join("; ") || "none";
    const eventTitles = triplet.events.map((event) => event.title).join("; ") || "none";
    const memoryTexts = triplet.memories.map((memory) => memory.insight_text).join(" | ") || "none";
    return [
      `triplet=${triplet.id}`,
      `state_ref=${triplet.episode.state.graph_source_ref}`,
      `state_quality=${triplet.episode.state.source_quality}`,
      `samples=${triplet.episode.samples.map((sample) => sample.graph_source_ref).join(",") || "none"}`,
      `events=${eventTitles}`,
      `meetings=${meetingTitles}`,
      `memories=${memoryTexts}`,
    ].join("\n");
  });

  return [
    "Return a DaoBrew GraphDelta. Do not invent biometric episodes.",
    "Use only the source refs present in these deterministic triplet joins.",
    `user_id=${input.user_id ?? "unresolved"}`,
    ...rows,
  ].join("\n\n");
}
