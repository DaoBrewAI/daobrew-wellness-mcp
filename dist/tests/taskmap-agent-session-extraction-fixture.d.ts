import type { TaskMapAgentSessionSemanticAdmissionV2 } from "../src/engine/taskmap/agent-session-semantic-admission.js";
import type { TaskMapAgentSessionExtractionReportV1 } from "../src/engine/taskmap/agent-session-refresh-llm-replay.js";
export declare function buildAgentSessionExtractionFixture(admission: TaskMapAgentSessionSemanticAdmissionV2, assessedAt: string): TaskMapAgentSessionExtractionReportV1;
export declare function refreshAgentSessionExtractionFixture(input: {
    admission: TaskMapAgentSessionSemanticAdmissionV2;
    taskMapRoot: string;
    runtimeRoot: string;
    promptTemplatePath: string;
    assessedAt: string;
}): Promise<TaskMapAgentSessionExtractionReportV1>;
