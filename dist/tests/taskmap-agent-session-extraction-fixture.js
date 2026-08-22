"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentSessionExtractionFixture = buildAgentSessionExtractionFixture;
exports.refreshAgentSessionExtractionFixture = refreshAgentSessionExtractionFixture;
const agent_session_refresh_llm_replay_js_1 = require("../src/engine/taskmap/agent-session-refresh-llm-replay.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
function buildAgentSessionExtractionFixture(admission, assessedAt) {
    const gate = (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)("request", "self");
    const clusters = admission.clusters.map((cluster) => ({
        clusterIdentityDigest: cluster.clusterIdentityDigest,
        workstreamIdentityDigest: cluster.workstreamIdentityDigest,
        inputDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            fixture: "agent-extraction-input",
            clusterIdentityDigest: cluster.clusterIdentityDigest,
        }),
        status: "extracted",
        degradationCode: null,
        envelopeDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            fixture: "agent-extraction-envelope",
            clusterIdentityDigest: cluster.clusterIdentityDigest,
        }),
        envelopeModel: "fixture-model",
        envelopeTransport: "claude-cli",
        mentions: [{
                text: cluster.assistantOutcomeSummary ?? cluster.userDirectiveSummary,
                title: cluster.userDirectiveSummary,
                speechActClass: "request",
                speechActActor: "self",
                confidence: 0.9,
                mentionIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                    fixture: "agent-extraction-mention",
                    clusterIdentityDigest: cluster.clusterIdentityDigest,
                }),
                proposalDisposition: gate.proposalDisposition,
                promotionEligible: gate.promotionEligible,
            }],
    }));
    const base = {
        contractVersion: "taskmap-agent-session-extraction-report.v1",
        ownerScopeDigest: admission.ownerScopeDigest,
        admissionDigest: admission.admissionDigest,
        promptTemplateDigest: (0, source_contracts_js_1.taskMapContractDigest)("fixture-agent-prompt"),
        assessedAt,
        clusters,
        pendingCount: 0,
    };
    return {
        ...base,
        reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(base),
    };
}
async function refreshAgentSessionExtractionFixture(input) {
    const ordered = [...input.admission.clusters].sort((left, right) => left.clusterIdentityDigest.localeCompare(right.clusterIdentityDigest));
    let runIndex = 0;
    const createStation = async () => ({
        provider: {
            transport: "claude-cli",
            executable: "/fixture/provider",
            args: [],
            model: "fixture-model",
        },
        async run(request) {
            const cluster = ordered[runIndex++];
            if (cluster === undefined
                || !request.promptText.includes(cluster.userDirectiveSummary))
                throw new Error("fixture station cluster order is inconsistent");
            return {
                stationId: "mention-extraction-v1",
                model: "fixture-model",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
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
    return (0, agent_session_refresh_llm_replay_js_1.refreshTaskMapAgentSessionExtraction)({
        admission: input.admission,
        taskMapRoot: input.taskMapRoot,
        runtimeRoot: input.runtimeRoot,
        ownerScopeDigest: input.admission.ownerScopeDigest,
        promptTemplatePath: input.promptTemplatePath,
        assessedAt: input.assessedAt,
        createStation,
    });
}
