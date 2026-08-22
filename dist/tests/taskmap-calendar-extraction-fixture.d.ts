import type { TaskMapCalendarProducerResultV1 } from "../src/engine/taskmap/calendar-producer-freshness.js";
import { type TaskMapCalendarExtractionReportV1 } from "../src/engine/taskmap/calendar-refresh-llm-replay.js";
export declare function refreshCalendarExtractionFixture(input: {
    result: TaskMapCalendarProducerResultV1;
    taskMapRoot: string;
    runtimeRoot: string;
    promptTemplatePath: string;
    assessedAt: string;
}): Promise<TaskMapCalendarExtractionReportV1>;
