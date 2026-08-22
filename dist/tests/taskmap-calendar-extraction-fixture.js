"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshCalendarExtractionFixture = refreshCalendarExtractionFixture;
const calendar_refresh_llm_replay_js_1 = require("../src/engine/taskmap/calendar-refresh-llm-replay.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
async function refreshCalendarExtractionFixture(input) {
    const createStation = async () => ({
        provider: {
            transport: "claude-cli",
            executable: "/fixture/provider",
            args: [],
            model: "fixture-model",
        },
        async run(request) {
            const event = input.result.events.find((candidate) => request.promptText.includes(candidate.title));
            if (event === undefined) {
                throw new Error("calendar fixture station segment is inconsistent");
            }
            return {
                stationId: "mention-extraction-v1",
                model: "fixture-model",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
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
    return (0, calendar_refresh_llm_replay_js_1.refreshTaskMapCalendarExtraction)({
        result: input.result,
        taskMapRoot: input.taskMapRoot,
        runtimeRoot: input.runtimeRoot,
        ownerScopeDigest: input.result.ownerScopeDigest,
        promptTemplatePath: input.promptTemplatePath,
        assessedAt: input.assessedAt,
        createStation,
    });
}
