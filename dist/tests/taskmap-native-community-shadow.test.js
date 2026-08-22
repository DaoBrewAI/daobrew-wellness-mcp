"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const community_graph_brain_js_1 = require("../src/engine/taskmap/community-graph-brain.js");
const community_root_proposals_js_1 = require("../src/engine/taskmap/community-root-proposals.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const native_semantic_builder_adapter_js_1 = require("../src/engine/taskmap/native-semantic-builder-adapter.js");
const native_community_shadow_js_1 = require("../src/engine/taskmap/native-community-shadow.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const REQUESTED_AT = "2026-08-17T12:00:00.000Z";
const OWNER_SCOPE_DIGEST = digest("owner");
const SHARED_REF_DIGEST = digest("shared-work");
const SECRET = "sk-proj-abcdefghijklmnop";
const OWNER_PATH = "/Users/neo/private/community-shadow.txt";
function digest(label) {
    return (0, source_contracts_js_1.taskMapContractDigest)(`native-community-shadow-test:${label}`);
}
function stableId(prefix, value) {
    return `${prefix}_${value.slice(0, 16)}`;
}
function agentEpisode(label, occurredAt = "2026-08-11T10:00:00.000Z", directiveSemanticDigest = SHARED_REF_DIGEST, userDirectiveSummary = `Ship the bounded ${label} adapter`) {
    const episodeIdentityDigest = digest(`episode-identity:${label}`);
    const graphEpisodeDigest = digest(`graph-episode:${label}`);
    const producerEpisodeBase = {
        episodeIdentityDigest,
        turnLineageIdentityDigest: digest(`lineage:${label}`),
        directiveSemanticDigest,
        disposition: "work_candidate",
        rootSessionIdentityDigest: digest(`root-session:${label}`),
        parentRootSessionIdentityDigest: null,
        provider: "codex",
        semanticUnit: "bounded_user_turn_work_episode",
        recordKind: "work_context",
        proposalDisposition: "candidate_or_context_only",
        authority: "none",
        acceptedMembershipAuthority: false,
        lifecycleAuthority: false,
        completionAuthority: false,
        verificationAuthority: false,
        occurredAt,
        observedAt: occurredAt,
        routing: {
            role: "routing_metadata_only",
            projectIdentityDigests: [],
            repositoryIdentityDigests: [],
            providerNeutralProjectIdentityDigests: [],
            providerNeutralRepositoryIdentityDigests: [],
        },
        userDirectiveSummary,
        assistantOutcomeSummary: null,
    };
    return {
        ...producerEpisodeBase,
        episodeId: `tmaepisode_${(0, source_contracts_js_1.taskMapContractDigest)(episodeIdentityDigest).slice(0, 16)}`,
        episodeRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(producerEpisodeBase),
        graphEpisodeId: stableId("tmagraph", graphEpisodeDigest),
        graphEpisodeDigest,
        graphEpisodeRevisionDigest: digest(`graph-revision:${label}`),
        workstreamIdentityDigest: digest(`workstream:${label}`),
        routingKind: "repository",
        providerNeutralRoutingDigest: digest(`routing:${label}`),
        isoWeek: "2026-W33",
        recurrenceCount: 1,
        firstSeenAt: occurredAt,
    };
}
function agentFeed(episodes) {
    const canonicalEpisodes = [...episodes].sort((left, right) => left.graphEpisodeId < right.graphEpisodeId
        ? -1
        : left.graphEpisodeId > right.graphEpisodeId
            ? 1
            : 0);
    const base = {
        contractVersion: agent_session_semantic_admission_js_1.TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION,
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        producedAt: REQUESTED_AT,
        authority: "none",
        acceptedMembershipAuthority: false,
        limits: agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1,
        counts: {
            inputObservations: canonicalEpisodes.length,
            eligibleEpisodes: canonicalEpisodes.length,
            deduplicatedEpisodes: canonicalEpisodes.length,
            selectedEpisodes: canonicalEpisodes.length,
        },
        episodes: canonicalEpisodes,
    };
    const feedDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    return {
        ...base,
        feedId: stableId("tmagraphfeed", feedDigest),
        feedDigest,
    };
}
function agentFeedWithSummaries(summaries, directiveSemanticDigest = SHARED_REF_DIGEST) {
    return agentFeed(summaries.map((summary, index) => {
        const episode = agentEpisode(`summary-${index}`, `2026-08-${String(11 + index).padStart(2, "0")}T10:00:00.000Z`, directiveSemanticDigest, summary);
        return episode;
    }));
}
function realAgentGraphFeed() {
    const observation = realAgentObservation("real-shadow");
    return (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        producedAt: REQUESTED_AT,
        observations: [observation],
    });
}
function realAgentObservation(label) {
    return {
        provider: "codex",
        rawJsonl: [
            {
                timestamp: "2026-08-17T09:59:00.000Z",
                type: "session_meta",
                payload: { id: `${label}-session` },
            },
            {
                timestamp: "2026-08-17T09:59:30.000Z",
                type: "turn_context",
                payload: { repository: `/repo/${label}` },
            },
            {
                timestamp: "2026-08-17T10:00:00.000Z",
                type: "response_item",
                payload: {
                    id: `${label}-turn`,
                    type: "message",
                    role: "user",
                    content: [{
                            type: "input_text",
                            text: `Validate the real Agent graph feed ${label}`,
                        }],
                },
            },
        ].map((row) => JSON.stringify(row)).join("\n") + "\n",
    };
}
function pointer(draft) {
    return {
        id: draft.pointerId,
        sourceKind: draft.sourceKind,
        sourceObjectId: `opaque-${digest(`object:${draft.pointerId}`)}`,
        sourceRefHash: digest(`semantic:${draft.pointerId}`),
        sourceVersion: digest(`content:${draft.pointerId}`),
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
    };
}
function sourceBinding(draft, source) {
    const revision = `revision-${digest(`revision:${draft.pointerId}`).slice(0, 16)}`;
    return {
        pointerId: draft.pointerId,
        semanticClass: draft.sourceKind === "gemini_meet" || draft.sourceKind === "granola"
            ? "meeting_context"
            : "context_only",
        semanticOriginId: draft.semanticOriginId,
        semanticIdentityDigest: source.sourceRefHash,
        sourceIdentityDigest: digest(`source:${draft.pointerId}`),
        observedRevision: revision,
        evidenceRevision: revision,
        observedContentDigest: source.sourceVersion,
        evidenceContentDigest: source.sourceVersion,
    };
}
function candidateRows(draft) {
    const source = pointer(draft);
    const title = draft.title ?? `Candidate ${draft.id}`;
    const summary = draft.summary ?? `Bounded work context for ${draft.id}`;
    const externalReferenceDigests = [
        draft.sharedRefDigest ?? digest(`shared:${draft.id}`),
    ];
    const candidateDigest = draft.candidateIdentityDigest
        ?? (0, meeting_producer_freshness_js_1.taskMapMeetingStatementReferenceDigest)({
            kind: draft.candidateKind,
            title,
            summary,
            explicitExternalReferenceDigests: externalReferenceDigests,
        });
    const candidateIdentityRef = `external:${candidateDigest}`;
    const event = {
        id: draft.id,
        pointerId: draft.pointerId,
        recordKind: "work_context",
        activity: "commitment_stated",
        occurredAt: draft.occurredAt,
        observedAt: draft.occurredAt,
        dayKey: draft.occurredAt.slice(0, 10),
        objectRefs: [
            draft.sharedRefDigest ?? digest(`shared:${draft.id}`),
            `external:${externalReferenceDigests[0]}`,
            candidateIdentityRef,
            `canonical-meeting:${draft.semanticOriginId}`,
            `source-object:${digest(`source-object:${draft.id}`)}`,
        ],
        title,
        summary,
        extractionConfidence: 0.9,
        bodyJoinEligible: true,
    };
    return {
        pointer: source,
        event,
        sourceBinding: sourceBinding(draft, source),
        evidenceBinding: {
            eventId: draft.id,
            disposition: "candidate_only",
            candidateIdentityRef,
            candidateKind: draft.candidateKind,
            rootLinkRefs: [`external:${externalReferenceDigests[0]}`],
        },
    };
}
function semanticFragment(drafts) {
    const rows = drafts.map(candidateRows);
    const pointers = [...new Map(rows.map((row) => [
            row.pointer.id,
            row.pointer,
        ])).values()];
    const sourceBindings = [...new Map(rows.map((row) => [
            row.sourceBinding.pointerId,
            row.sourceBinding,
        ])).values()];
    return {
        contractVersion: native_semantic_builder_adapter_js_1.TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION,
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        producer: {
            id: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
            version: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
        },
        freshness: {
            decision: "fresh",
            available: true,
            retainedLastGood: false,
            producedAt: "2026-08-17T10:00:00.000Z",
            validThrough: "2026-08-17T14:00:00.000Z",
            assessedAt: "2026-08-17T12:00:00.000Z",
        },
        sourceBindings,
        evidenceBindings: rows.map((row) => row.evidenceBinding),
        taskMapInput: {
            contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
            generatedAt: REQUESTED_AT,
            pointers,
            events: rows.map((row) => row.event),
        },
    };
}
function baseInput(overrides = {}) {
    const feed = overrides.agentSessionGraphFeed ?? null;
    const inputObservations = feed?.counts.inputObservations ?? 0;
    const selectedEpisodes = feed?.counts.selectedEpisodes ?? 0;
    return {
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        requestedAt: REQUESTED_AT,
        legacyBindings: {
            graphInputDigest: digest("legacy-graph-input"),
            candidateDigest: digest("legacy-candidate"),
            projectionDigest: digest("legacy-projection"),
            promotionReceiptHeadDigest: digest("legacy-promotion-head"),
        },
        agentSessionGraphFeed: feed,
        graphCollectionCoverage: {
            contractVersion: "taskmap-native-community-graph-coverage.v1",
            discovery: { directoriesVisited: 0, candidatesDiscovered: inputObservations, directoryLimit: 1_024, candidateLimit: 4_096, directoryLimitReached: false, candidateLimitReached: false },
            reads: { attemptedFiles: inputObservations, attemptLimit: 1_024, droppedAttemptLimit: 0, droppedInvalid: 0 },
            scan: { chargedBytes: 0, globalByteLimit: 64 * 1_024 * 1_024, perFileByteLimit: 512 * 1_024, droppedScanBudget: 0 },
            observations: { selectedObservations: inputObservations, observationLimit: 512, droppedObservationLimit: 0, rawBytesSelected: 0, rawByteLimit: 32 * 1_024 * 1_024, droppedRawByteBudget: 0, graphEpisodesSelected: selectedEpisodes, maxGraphEpisodes: 256, droppedGraphEpisodes: Math.max(0, (feed?.counts.deduplicatedEpisodes ?? 0) - selectedEpisodes) },
            distribution: { codexSelected: 0, claudeSelected: 0, isoWeeksSelected: 0 },
            completeness: "unknown",
            truncationReasons: ["not_collected"],
            authority: "none",
            privacy: { pathsPersisted: false, textPersisted: false, secretsPersisted: false, vectorsPersisted: false },
        },
        semanticEvidence: {},
        previousAcceptedRoots: [],
        expectedLegacyFlags: {
            readAuthority: false,
            rankingMutated: false,
            bodyMutated: false,
            acceptanceStoreMutated: false,
        },
        ...overrides,
    };
}
function vector() {
    const result = new Array(community_graph_brain_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.embeddingDimensions).fill(0);
    result[0] = 1;
    return result;
}
function station(calls) {
    return {
        provider: {
            transport: "gemini-remote",
            executable: "injected-shadow-station",
            args: [],
            model: "shadow-grouping-fixture",
        },
        async run(request) {
            calls.push(request);
            if (request.stationId === "community-title-v1") {
                const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
                return {
                    stationId: request.stationId,
                    model: "shadow-grouping-fixture",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({
                        titles: (payload.communities ?? []).map((community) => ({
                            baseRootProposalId: community.baseRootProposalId,
                            title: "Ship the grouped shadow workstream",
                        })),
                    }),
                    producedAt: REQUESTED_AT,
                    transport: "gemini-remote",
                };
            }
            return {
                stationId: request.stationId,
                model: "shadow-grouping-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: '{"groups":[]}',
                producedAt: REQUESTED_AT,
                transport: "gemini-remote",
            };
        },
    };
}
async function reusableCommunityFixture() {
    const input = baseInput({
        agentSessionGraphFeed: agentFeed([
            agentEpisode("previous-root-privacy", undefined, SHARED_REF_DIGEST),
        ]),
        candidateSemanticFragment: semanticFragment([{
                id: "previous-root-privacy-event",
                pointerId: "previous-root-privacy-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("previous-root-privacy-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-12T10:00:00.000Z",
                sharedRefDigest: SHARED_REF_DIGEST,
            }]),
    });
    const baseline = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(input);
    strict_1.default.equal(baseline.proposalSet.proposals.length, 1);
    return {
        input,
        memberNodeIds: [...baseline.proposalSet.proposals[0].memberNodeIds],
    };
}
async function assertPreviousRootPrivacyRejected(input, unsafeValue) {
    await strict_1.default.rejects((0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(input), (error) => {
        strict_1.default.ok(error instanceof native_community_shadow_js_1.TaskMapNativeCommunityShadowUnavailableError);
        strict_1.default.equal(error.code, "invalid_input");
        strict_1.default.equal(error.message, "Task Map native community shadow unavailable: invalid_input");
        strict_1.default.equal(error.message.includes(unsafeValue), false);
        return true;
    });
}
async function assertShadowInvalidInput(input) {
    await strict_1.default.rejects((0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(input), (error) => {
        strict_1.default.ok(error instanceof native_community_shadow_js_1.TaskMapNativeCommunityShadowUnavailableError);
        strict_1.default.equal(error.code, "invalid_input");
        strict_1.default.equal(error.message, "Task Map native community shadow unavailable: invalid_input");
        return true;
    });
}
(0, node_test_1.describe)("Task Map pure native community shadow adapter", () => {
    (0, node_test_1.it)("builds deterministic bounded root evidence without historical tasks", async () => {
        const feed = agentFeed(Array.from({ length: 6 }, (_, index) => agentEpisode(`historical-${index}`, `2026-08-${String(10 + index).padStart(2, "0")}T10:00:00.000Z`, digest(`historical-directive-${index}`))));
        const prepared = baseInput({ agentSessionGraphFeed: feed });
        const groupingStation = {
            provider: {
                transport: "gemini-remote",
                executable: "injected-history-station",
                args: [],
                model: "history-projection-fixture",
            },
            async run(request) {
                const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
                return {
                    stationId: request.stationId,
                    model: "history-projection-fixture",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: request.stationId === "community-title-v1"
                        ? JSON.stringify({
                            titles: (payload.communities ?? []).map((community) => ({
                                baseRootProposalId: community.baseRootProposalId,
                                title: "Historical delivery",
                            })),
                        })
                        : JSON.stringify({
                            groups: [{
                                    nodeIds: (payload.nodes ?? []).map((node) => node.nodeId),
                                }],
                        }),
                    producedAt: REQUESTED_AT,
                    transport: "gemini-remote",
                };
            },
        };
        const plan = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityPlan)({
            ownerScopeDigest: OWNER_SCOPE_DIGEST,
            requestedAt: REQUESTED_AT,
            agentSessionGraphFeed: feed,
            graphCollectionCoverage: prepared.graphCollectionCoverage,
            semanticEvidence: { station: groupingStation },
            previousAcceptedRoots: [],
        });
        const evidence = (0, native_community_shadow_js_1.buildTaskMapNativeCommunityRootEvidence)({
            plan,
            feed,
            generatedAt: REQUESTED_AT,
        });
        const brain = {
            contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
            provider: "root-evidence-test",
            model: "root-evidence-test",
            promptHash: plan.planDigest,
            inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(evidence.taskMapInput),
            generatedAt: REQUESTED_AT,
            roots: evidence.rootProposals,
            tasks: [],
            edges: [],
        };
        const first = (0, harness_js_1.buildTaskMapProjection)(evidence.taskMapInput, brain, { arm: "E4", now: REQUESTED_AT });
        const replay = (0, harness_js_1.buildTaskMapProjection)(evidence.taskMapInput, brain, { arm: "E4", now: REQUESTED_AT });
        strict_1.default.equal(first.runStatus, "accepted", JSON.stringify(first.rejections));
        strict_1.default.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(first), []);
        strict_1.default.deepEqual(replay, first);
        strict_1.default.equal(first.roots.length, 1);
        strict_1.default.equal(first.roots[0]?.title, "Historical delivery");
        strict_1.default.equal(first.tasks.length, 0);
        strict_1.default.equal(first.edges.length, 0);
        strict_1.default.equal(first.sources.length, 5);
        strict_1.default.equal(first.roots[0]?.taskIds.length, 0);
        strict_1.default.equal(first.roots[0]?.citations.length, 5);
    });
    (0, node_test_1.it)("maps only exact unambiguous Plan2 members and leaves ambiguous or unmapped clusters for legacy fallback", async () => {
        const observations = [
            realAgentObservation("plan-map-alpha"),
            realAgentObservation("plan-map-beta"),
            realAgentObservation("plan-map-gamma"),
            realAgentObservation("plan-map-delta"),
        ];
        const feed = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
            ownerScopeDigest: OWNER_SCOPE_DIGEST,
            producedAt: REQUESTED_AT,
            observations,
        });
        const admission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)((0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
            ownerScopeDigest: OWNER_SCOPE_DIGEST,
            producedAt: REQUESTED_AT,
            observations,
        }));
        const prepared = baseInput({ agentSessionGraphFeed: feed });
        const singletonStation = {
            provider: {
                transport: "gemini-remote",
                executable: "injected-plan-station",
                args: [],
                model: "plan-mapping-fixture",
            },
            async run(request) {
                const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
                return {
                    stationId: request.stationId,
                    model: "plan-mapping-fixture",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: request.stationId === "community-title-v1"
                        ? JSON.stringify({
                            titles: (payload.communities ?? []).map((community, index) => ({
                                baseRootProposalId: community.baseRootProposalId,
                                title: `Mapped root ${index + 1}`,
                            })),
                        })
                        : JSON.stringify({
                            groups: [
                                { nodeIds: (payload.nodes ?? []).slice(0, 2).map((node) => node.nodeId) },
                                { nodeIds: (payload.nodes ?? []).slice(2).map((node) => node.nodeId) },
                            ],
                        }),
                    producedAt: REQUESTED_AT,
                    transport: "gemini-remote",
                };
            },
        };
        const plan = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityPlan)({
            ownerScopeDigest: OWNER_SCOPE_DIGEST,
            requestedAt: REQUESTED_AT,
            agentSessionGraphFeed: feed,
            graphCollectionCoverage: prepared.graphCollectionCoverage,
            semanticEvidence: { station: singletonStation },
            previousAcceptedRoots: [],
        });
        strict_1.default.equal(plan.proposalSet.proposals.length, 2);
        const altered = structuredClone(plan);
        const ambiguousEpisode = feed.episodes[0];
        const ambiguousRoot = altered.proposalSet.proposals.find((proposal) => proposal.memberNodeIds.includes(ambiguousEpisode.graphEpisodeId));
        const mappedRoot = altered.proposalSet.proposals.find((proposal) => proposal.rootProposalId !== ambiguousRoot.rootProposalId);
        const episodeById = new Map(feed.episodes.map((episode) => [
            episode.graphEpisodeId,
            episode,
        ]));
        const secondMappedEpisode = episodeById.get(ambiguousRoot.memberNodeIds.find((nodeId) => nodeId !== ambiguousEpisode.graphEpisodeId));
        const [mappedEpisode, unmappedEpisode] = mappedRoot.memberNodeIds.map((nodeId) => episodeById.get(nodeId));
        strict_1.default.notEqual(ambiguousRoot.rootProposalId, mappedRoot.rootProposalId);
        mappedRoot.memberNodeIds = [...mappedRoot.memberNodeIds,
            ambiguousEpisode.graphEpisodeId].sort();
        for (const proposal of altered.proposalSet.proposals) {
            proposal.memberNodeIds = proposal.memberNodeIds.filter((nodeId) => nodeId !== unmappedEpisode.graphEpisodeId);
        }
        const mapped = (0, native_community_shadow_js_1.mapTaskMapNativeCommunityPlanToAgentRoots)({
            plan: altered,
            feed,
            admission,
        });
        const mappedClusterIds = mapped.roots.flatMap((root) => root.clusterIdentityDigests);
        const clusterForEpisode = (episode) => admission.clusters.find((cluster) => cluster.workstreamIdentityDigest === episode.workstreamIdentityDigest
            && cluster.directiveSemanticDigest === episode.directiveSemanticDigest);
        strict_1.default.deepEqual(mappedClusterIds.sort(), [
            clusterForEpisode(mappedEpisode).clusterIdentityDigest,
            clusterForEpisode(secondMappedEpisode).clusterIdentityDigest,
        ].sort());
        strict_1.default.equal(mappedClusterIds.includes(clusterForEpisode(ambiguousEpisode).clusterIdentityDigest), false);
        strict_1.default.equal(mappedClusterIds.includes(clusterForEpisode(unmappedEpisode).clusterIdentityDigest), false);
    });
    (0, node_test_1.it)("adapts Agent plus mixed meeting/calendar candidates and preserves the calendar context boundary", async () => {
        const origin = digest("canonical-meeting");
        const fragment = semanticFragment([
            {
                id: "meeting-event",
                pointerId: "meeting-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: origin,
                candidateKind: "action_item",
                occurredAt: "2026-08-12T10:00:00.000Z",
                sharedRefDigest: SHARED_REF_DIGEST,
            },
            {
                id: "calendar-context-event",
                pointerId: "calendar-context-pointer",
                sourceKind: "google_calendar",
                semanticOriginId: origin,
                candidateKind: "action_item",
                occurredAt: "2026-08-13T10:00:00.000Z",
                sharedRefDigest: SHARED_REF_DIGEST,
            },
            {
                id: "calendar-commitment-event",
                pointerId: "calendar-commitment-pointer",
                sourceKind: "local_calendar",
                semanticOriginId: origin,
                candidateKind: "commitment",
                occurredAt: "2026-08-14T10:00:00.000Z",
                sharedRefDigest: SHARED_REF_DIGEST,
            },
        ]);
        const result = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: agentFeed([agentEpisode("agent")]),
            candidateSemanticFragment: fragment,
        }));
        strict_1.default.equal(result.contractVersion, native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_SHADOW_VERSION);
        strict_1.default.deepEqual(result.sourceFamilyCounts, {
            agent: 1,
            meeting: 1,
            calendar: 2,
        });
        strict_1.default.equal(result.resourceUsage.nodeCount, 4);
        strict_1.default.equal(result.communities.length, 1);
        strict_1.default.equal(result.communities[0]?.memberNodeIds.length, 3);
        strict_1.default.equal(result.communities[0]?.contextNodeIds.length, 1);
        strict_1.default.deepEqual(result.communities[0]?.sourceFamilies, [
            "agent", "calendar", "meeting",
        ]);
        strict_1.default.equal(result.proposalSet.proposals.length, 1);
        strict_1.default.equal(result.proposalSet.proposals[0]?.memberNodeIds.length, 3);
        strict_1.default.ok((result.proposalSet.proposals[0]?.title.length ?? 0) > 0);
        strict_1.default.equal(result.proposalSet.proposals[0]?.titleSource, "deterministic_fallback");
        strict_1.default.equal(result.proposalSet.titleGeneration, null);
        strict_1.default.equal(result.proposalSet.monitoring.titleBatchAttempted, false);
        strict_1.default.equal(result.proposalSet.proposals[0]?.memberNodeIds.includes(result.communities[0].contextNodeIds[0]), false);
    });
    (0, node_test_1.it)("accepts official feed counts when one observation yields multiple eligible episodes", async () => {
        const feed = agentFeed([
            agentEpisode("multi-a"),
            agentEpisode("multi-b"),
        ]);
        feed.counts.inputObservations = 1;
        const { feedDigest: _feedDigest, feedId: _feedId, ...base } = feed;
        feed.feedDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
        feed.feedId = stableId("tmagraphfeed", feed.feedDigest);
        const result = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: feed,
        }));
        strict_1.default.equal(result.feed.counts.inputObservations, 1);
        strict_1.default.equal(result.feed.counts.eligibleEpisodes, 2);
        strict_1.default.equal(result.sourceFamilyCounts.agent, 2);
    });
    (0, node_test_1.it)("accepts real producer-domain episode IDs while rejecting arbitrary stable-shaped IDs", async () => {
        const feed = realAgentGraphFeed();
        strict_1.default.equal(feed.episodes.length, 1);
        strict_1.default.notEqual(feed.episodes[0].episodeId, stableId("tmaepisode", feed.episodes[0].episodeIdentityDigest));
        const accepted = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: feed,
        }));
        strict_1.default.equal(accepted.sourceFamilyCounts.agent, 1);
        const arbitrary = structuredClone(feed);
        arbitrary.episodes[0].episodeId = "tmaepisode_0000000000000000";
        const { feedDigest: _feedDigest, feedId: _feedId, ...base } = arbitrary;
        arbitrary.feedDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
        arbitrary.feedId = stableId("tmagraphfeed", arbitrary.feedDigest);
        await assertShadowInvalidInput(baseInput({
            agentSessionGraphFeed: arbitrary,
        }));
    });
    (0, node_test_1.it)("rejects a recomputed Agent feed whose episodes are not in canonical graphEpisodeId order", async () => {
        const feed = agentFeed([
            agentEpisode("canonical-order-a"),
            agentEpisode("canonical-order-b"),
            agentEpisode("canonical-order-c"),
        ]);
        feed.episodes.reverse();
        const { feedDigest: _feedDigest, feedId: _feedId, ...base } = feed;
        feed.feedDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
        feed.feedId = stableId("tmagraphfeed", feed.feedDigest);
        await assertShadowInvalidInput(baseInput({
            agentSessionGraphFeed: feed,
        }));
    });
    (0, node_test_1.it)("rejects an Agent graph feed produced after artifact requestedAt", async () => {
        const feed = agentFeed([agentEpisode("future-feed")]);
        feed.producedAt = "2026-08-17T12:00:00.001Z";
        const { feedDigest: _feedDigest, feedId: _feedId, ...base } = feed;
        feed.feedDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
        feed.feedId = stableId("tmagraphfeed", feed.feedDigest);
        await assertShadowInvalidInput(baseInput({
            agentSessionGraphFeed: feed,
        }));
    });
    (0, node_test_1.it)("deduplicates candidate identity plus semantic origin by code-point-smallest event id", async () => {
        const origin = digest("dedupe-origin");
        const sharedRefDigest = digest("dedupe-shared-ref");
        const fragment = semanticFragment([
            {
                id: "z-event",
                pointerId: "z-pointer",
                sourceKind: "granola",
                semanticOriginId: origin,
                candidateKind: "commitment",
                occurredAt: "2026-08-16T10:00:00.000Z",
                title: "Same explicit statement",
                summary: "Same exact normalized semantic candidate",
                sharedRefDigest,
            },
            {
                id: "a-event",
                pointerId: "a-pointer",
                sourceKind: "granola",
                semanticOriginId: origin,
                candidateKind: "commitment",
                occurredAt: "2026-08-10T10:00:00.000Z",
                title: "Same explicit statement",
                summary: "Same exact normalized semantic candidate",
                sharedRefDigest,
            },
        ]);
        const result = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: agentFeed([
                agentEpisode("dedupe-agent", "2026-08-11T10:00:00.000Z", sharedRefDigest),
            ]),
            candidateSemanticFragment: fragment,
        }));
        strict_1.default.deepEqual(result.sourceFamilyCounts, {
            agent: 1,
            meeting: 1,
            calendar: 0,
        });
        strict_1.default.equal(result.resourceUsage.nodeCount, 2);
        strict_1.default.equal(result.communities.length, 1);
        strict_1.default.deepEqual(result.communities[0]?.dateSpan, {
            startAt: "2026-08-10T10:00:00.000Z",
            endAt: "2026-08-11T10:00:00.000Z",
        });
    });
    (0, node_test_1.it)("excludes superseded, retracted, and retracting candidate evidence", async () => {
        const supersession = semanticFragment([
            {
                id: "superseded-event",
                pointerId: "supersession-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("supersession-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-11T10:00:00.000Z",
            },
            {
                id: "replacement-event",
                pointerId: "supersession-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("supersession-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-12T10:00:00.000Z",
            },
        ]);
        supersession.taskMapInput.events[1].supersedesEventId =
            "superseded-event";
        const replaced = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            candidateSemanticFragment: supersession,
        }));
        strict_1.default.deepEqual(replaced.sourceFamilyCounts, {
            agent: 0,
            meeting: 1,
            calendar: 0,
        });
        strict_1.default.equal(replaced.resourceUsage.nodeCount, 1);
        const retraction = semanticFragment([
            {
                id: "retracted-event",
                pointerId: "retraction-pointer",
                sourceKind: "granola",
                semanticOriginId: digest("retraction-origin"),
                candidateKind: "action_item",
                occurredAt: "2026-08-11T10:00:00.000Z",
            },
            {
                id: "retractor-event",
                pointerId: "retraction-pointer",
                sourceKind: "granola",
                semanticOriginId: digest("retraction-origin"),
                candidateKind: "action_item",
                occurredAt: "2026-08-12T10:00:00.000Z",
            },
        ]);
        retraction.taskMapInput.events[1].retractsEventId = "retracted-event";
        const retracted = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            candidateSemanticFragment: retraction,
        }));
        strict_1.default.deepEqual(retracted.sourceFamilyCounts, {
            agent: 0,
            meeting: 0,
            calendar: 0,
        });
        strict_1.default.equal(retracted.resourceUsage.nodeCount, 0);
    });
    (0, node_test_1.it)("rejects cross-pointer supersession before active-event filtering", async () => {
        const fragment = semanticFragment([
            {
                id: "cross-pointer-target",
                pointerId: "cross-pointer-target-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("cross-pointer-target-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-11T10:00:00.000Z",
            },
            {
                id: "cross-pointer-superseder",
                pointerId: "cross-pointer-superseder-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("cross-pointer-superseder-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-12T10:00:00.000Z",
            },
        ]);
        fragment.taskMapInput.events[1].supersedesEventId =
            "cross-pointer-target";
        await assertShadowInvalidInput(baseInput({
            candidateSemanticFragment: fragment,
        }));
    });
    (0, node_test_1.it)("preserves same-identity meeting and calendar nodes without widening calendar membership", async () => {
        const origin = digest("cross-family-origin");
        const sharedRefDigest = digest("cross-family-shared-ref");
        const crossFamilyFragment = (candidateKind) => semanticFragment([
            {
                id: "a-calendar-event",
                pointerId: `calendar-${candidateKind}-pointer`,
                sourceKind: "google_calendar",
                semanticOriginId: origin,
                candidateKind,
                occurredAt: "2026-08-12T10:00:00.000Z",
                title: "Same cross-family candidate",
                summary: "Exact shared semantic statement",
                sharedRefDigest,
            },
            {
                id: "z-meeting-event",
                pointerId: `meeting-${candidateKind}-pointer`,
                sourceKind: "gemini_meet",
                semanticOriginId: origin,
                candidateKind,
                occurredAt: "2026-08-12T10:00:00.000Z",
                title: "Same cross-family candidate",
                summary: "Exact shared semantic statement",
                sharedRefDigest,
            },
        ]);
        const commitment = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: agentFeed([
                agentEpisode("cross-family-agent", "2026-08-11T10:00:00.000Z", sharedRefDigest),
            ]),
            candidateSemanticFragment: crossFamilyFragment("commitment"),
        }));
        strict_1.default.deepEqual(commitment.sourceFamilyCounts, {
            agent: 1,
            meeting: 1,
            calendar: 1,
        });
        strict_1.default.equal(commitment.resourceUsage.nodeCount, 3);
        strict_1.default.equal(commitment.communities[0]?.memberNodeIds.length, 3);
        strict_1.default.equal(commitment.communities[0]?.contextNodeIds.length, 0);
        const context = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: agentFeed([
                agentEpisode("cross-family-agent", "2026-08-11T10:00:00.000Z", sharedRefDigest),
            ]),
            candidateSemanticFragment: crossFamilyFragment("action_item"),
        }));
        strict_1.default.deepEqual(context.sourceFamilyCounts, {
            agent: 1,
            meeting: 1,
            calendar: 1,
        });
        strict_1.default.equal(context.resourceUsage.nodeCount, 3);
        strict_1.default.equal(context.communities[0]?.memberNodeIds.length, 2);
        strict_1.default.equal(context.communities[0]?.contextNodeIds.length, 1);
    });
    (0, node_test_1.it)("caps meeting/calendar nodes fairly across both families and weeks", async () => {
        const drafts = [];
        for (const sourceKind of ["gemini_meet", "google_calendar"]) {
            const familyOrigin = digest(`${sourceKind}:fair-origin`);
            for (let index = 0; index < 75; index += 1) {
                const day = index % 2 === 0 ? "03" : "10";
                drafts.push({
                    id: `${sourceKind}-${String(index).padStart(3, "0")}`,
                    pointerId: `${sourceKind}-fair-pointer`,
                    sourceKind,
                    semanticOriginId: familyOrigin,
                    candidateKind: "commitment",
                    occurredAt: `2026-08-${day}T10:00:00.000Z`,
                });
            }
        }
        const result = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            candidateSemanticFragment: semanticFragment(drafts),
        }));
        strict_1.default.equal(result.sourceFamilyCounts.meeting + result.sourceFamilyCounts.calendar, native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumMeetingCalendarNodes);
        strict_1.default.deepEqual(result.sourceFamilyCounts, {
            agent: 0,
            meeting: 64,
            calendar: 64,
        });
        strict_1.default.ok(result.communities.length >= 1);
        strict_1.default.ok(result.communities.every((community) => community.dateSpan.startAt === "2026-08-03T10:00:00.000Z"
            && community.dateSpan.endAt === "2026-08-10T10:00:00.000Z"));
    });
    (0, node_test_1.it)("is fully deterministic across candidate input permutations and canonicalizes its digest", async () => {
        const drafts = [
            {
                id: "meeting-b",
                pointerId: "meeting-b-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("permutation-origin-b"),
                candidateKind: "action_item",
                occurredAt: "2026-08-12T10:00:00.000Z",
            },
            {
                id: "calendar-a",
                pointerId: "calendar-a-pointer",
                sourceKind: "google_calendar",
                semanticOriginId: digest("permutation-origin-a"),
                candidateKind: "commitment",
                occurredAt: "2026-08-05T10:00:00.000Z",
            },
        ];
        const firstFragment = semanticFragment(drafts);
        const secondFragment = structuredClone(firstFragment);
        secondFragment.sourceBindings.reverse();
        secondFragment.evidenceBindings.reverse();
        secondFragment.taskMapInput.pointers.reverse();
        secondFragment.taskMapInput.events.reverse();
        secondFragment.taskMapInput.events.forEach((event) => event.objectRefs.reverse());
        secondFragment.evidenceBindings.forEach((binding) => binding.rootLinkRefs.reverse());
        const first = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            candidateSemanticFragment: firstFragment,
        }));
        const second = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            candidateSemanticFragment: secondFragment,
        }));
        strict_1.default.deepEqual(second, first);
        const { artifactId: _artifactId, artifactDigest: _artifactDigest, ...base } = first;
        strict_1.default.equal(first.artifactDigest, (0, source_contracts_js_1.taskMapContractDigest)(base));
        strict_1.default.equal(first.artifactId, stableId("tmcommunityshadow", first.artifactDigest));
    });
    (0, node_test_1.it)("runs the A/B semantic pipeline through injected station and embedding adapters", async () => {
        const root = await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-native-shadow-"));
        const stationCalls = [];
        const embeddingCalls = [];
        const embeddingProvider = {
            async embed(texts) {
                embeddingCalls.push([...texts]);
                return texts.map(() => vector());
            },
        };
        try {
            const fragment = semanticFragment([
                {
                    id: "ab-meeting-a",
                    pointerId: "ab-meeting-a-pointer",
                    sourceKind: "gemini_meet",
                    semanticOriginId: digest("ab-origin-a"),
                    candidateKind: "commitment",
                    occurredAt: "2026-08-11T10:00:00.000Z",
                },
                {
                    id: "ab-meeting-b",
                    pointerId: "ab-meeting-b-pointer",
                    sourceKind: "granola",
                    semanticOriginId: digest("ab-origin-b"),
                    candidateKind: "commitment",
                    occurredAt: "2026-08-12T10:00:00.000Z",
                },
            ]);
            const baseline = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
                candidateSemanticFragment: fragment,
            }));
            const semantic = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
                candidateSemanticFragment: fragment,
                semanticEvidence: {
                    station: station(stationCalls),
                    embeddingProvider,
                    embeddingModelId: "shadow-embedding-fixture",
                    groupingReplayPath: node_path_1.default.join(root, "grouping"),
                    embeddingCachePath: node_path_1.default.join(root, "embedding-cache.json"),
                },
            }));
            strict_1.default.deepEqual(stationCalls.map((call) => call.stationId), ["community-grouping-v1", "community-title-v1"]);
            strict_1.default.equal(embeddingCalls.length, 1);
            strict_1.default.equal(semantic.semanticEvidenceReport.grouping.state, "available", JSON.stringify(semantic.semanticEvidenceReport.grouping));
            strict_1.default.equal(semantic.semanticEvidenceReport.embedding.state, "available", JSON.stringify(semantic.semanticEvidenceReport.embedding));
            strict_1.default.notEqual(semantic.edges.digest, baseline.edges.digest);
            strict_1.default.ok(semantic.edges.count > baseline.edges.count);
            strict_1.default.deepEqual(semantic.proposalSet.proposals.map((proposal) => proposal.title), ["Ship the grouped shadow workstream"]);
        }
        finally {
            await (0, promises_1.rm)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("persists no node text, vectors, raw events, paths, or credentials", async () => {
        const privateText = "PRIVATE_SENTINEL_NEVER_PERSISTED";
        const fragment = semanticFragment([{
                id: "private-event",
                pointerId: "private-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("private-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-12T10:00:00.000Z",
                title: `Ship ${privateText}`,
                summary: `Bounded semantic context ${privateText}`,
                sharedRefDigest: SHARED_REF_DIGEST,
            }]);
        const result = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: agentFeed([
                agentEpisode("private agent", undefined, SHARED_REF_DIGEST),
            ]),
            candidateSemanticFragment: fragment,
            semanticEvidence: {
                groupingReplayPath: OWNER_PATH,
                station: {
                    provider: {
                        transport: "gemini-remote",
                        executable: SECRET,
                        args: [],
                        model: "privacy-fixture-model",
                    },
                    async run(request) {
                        return {
                            stationId: request.stationId,
                            model: "privacy-fixture-model",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: '{"groups":[]}',
                            producedAt: REQUESTED_AT,
                            transport: "gemini-remote",
                        };
                    },
                },
            },
        }));
        const serialized = (0, source_contracts_js_1.taskMapContractCanonicalJson)(result);
        strict_1.default.equal(serialized.includes("private agent"), false);
        strict_1.default.equal(serialized.includes("private-event"), false);
        strict_1.default.equal(serialized.includes(privateText), false);
        strict_1.default.equal(serialized.includes(OWNER_PATH), false);
        strict_1.default.equal(serialized.includes(SECRET), false);
        strict_1.default.equal(serialized.includes("embedding"), true);
        strict_1.default.equal(serialized.includes('"embedding":['), false);
        strict_1.default.equal(serialized.includes('"text":'), false);
        strict_1.default.equal(serialized.includes('"taskMapInput":'), false);
    });
    (0, node_test_1.it)("removes repeated embedded secrets and owner-path tokens from fallback titles while preserving ordinary titles", async () => {
        const embeddedSecret = "prefixsk-proj-abcdefghijklmnop";
        const embeddedPath = "prefix/Users/neo/private-roadmap";
        const unsafe = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: agentFeedWithSummaries([
                `Ship ${embeddedSecret} ${embeddedPath}`,
                `Review ${embeddedSecret} ${embeddedPath}`,
            ]),
        }));
        const unsafeSerialized = (0, source_contracts_js_1.taskMapContractCanonicalJson)(unsafe);
        strict_1.default.equal(unsafeSerialized.includes(embeddedSecret), false);
        strict_1.default.equal(unsafeSerialized.includes(embeddedPath), false);
        strict_1.default.equal(unsafeSerialized.includes("Users neo private-roadmap"), false);
        const safe = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            agentSessionGraphFeed: agentFeedWithSummaries([
                "Ship ordinary roadmap",
                "Review ordinary roadmap",
            ]),
        }));
        strict_1.default.equal(safe.proposalSet.proposals[0]?.title, "ordinary roadmap");
        strict_1.default.equal(safe.proposalSet.proposals[0]?.titleSource, "deterministic_fallback");
    });
    (0, node_test_1.it)("rejects sensitive grouping and embedding model provenance anywhere in the artifact base", async () => {
        const unsafeGroupingModel = "semantic-owner@example.com";
        let unsafeGroupingCalls = 0;
        const unsafeGrouping = baseInput({
            semanticEvidence: {
                station: {
                    provider: {
                        transport: "gemini-remote",
                        executable: "remote-api",
                        args: [],
                        model: unsafeGroupingModel,
                    },
                    async run(request) {
                        unsafeGroupingCalls += 1;
                        return {
                            stationId: request.stationId,
                            model: unsafeGroupingModel,
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: '{"groups":[]}',
                            producedAt: REQUESTED_AT,
                            transport: "gemini-remote",
                        };
                    },
                },
            },
        });
        const unsafeEmbedding = baseInput({
            semanticEvidence: {
                embeddingModelId: "model-prefix-sk-proj-abcdefghijklmnop-suffix",
            },
        });
        await assertShadowInvalidInput(unsafeGrouping);
        await assertShadowInvalidInput(unsafeEmbedding);
        strict_1.default.equal(unsafeGroupingCalls, 0);
    });
    (0, node_test_1.it)("binds exact legacy digests and exposes only non-authoritative shadow flags", async () => {
        const input = baseInput();
        const result = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(input);
        strict_1.default.deepEqual(result.legacyBindings, input.legacyBindings);
        strict_1.default.equal(result.authority, "none");
        strict_1.default.equal(result.readAuthority, false);
        strict_1.default.equal(result.rankingMutated, false);
        strict_1.default.equal(result.bodyMutated, false);
        strict_1.default.equal(result.acceptanceStoreMutated, false);
        strict_1.default.equal(result.proposalSet.authority, "none");
        strict_1.default.equal(result.proposalSet.requiresOwnerAcceptance, true);
        strict_1.default.ok(Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(result), "utf8")
            <= native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumOutputBytes);
    });
    (0, node_test_1.it)("rejects contradictory or non-canonical graph coverage claims", async () => {
        const baseline = baseInput().graphCollectionCoverage;
        for (const graphCollectionCoverage of [
            { ...structuredClone(baseline), completeness: "complete" },
            { ...structuredClone(baseline), completeness: "unknown", truncationReasons: [] },
            {
                ...structuredClone(baseline),
                completeness: "bounded_partial",
                truncationReasons: ["directory_limit"],
            },
            {
                ...structuredClone(baseline),
                discovery: {
                    ...structuredClone(baseline.discovery),
                    directoryLimit: 999,
                },
            },
        ]) {
            await assertShadowInvalidInput(baseInput({ graphCollectionCoverage }));
        }
        const feed = agentFeed([agentEpisode("coverage-feed")]);
        const bound = baseInput({ agentSessionGraphFeed: feed });
        for (const graphCollectionCoverage of [
            {
                ...structuredClone(bound.graphCollectionCoverage),
                observations: {
                    ...structuredClone(bound.graphCollectionCoverage.observations),
                    selectedObservations: bound.graphCollectionCoverage.observations.selectedObservations + 1,
                },
            },
            {
                ...structuredClone(bound.graphCollectionCoverage),
                observations: {
                    ...structuredClone(bound.graphCollectionCoverage.observations),
                    graphEpisodesSelected: bound.graphCollectionCoverage.observations.graphEpisodesSelected + 1,
                },
            },
            {
                ...structuredClone(bound.graphCollectionCoverage),
                observations: {
                    ...structuredClone(bound.graphCollectionCoverage.observations),
                    droppedGraphEpisodes: bound.graphCollectionCoverage.observations.droppedGraphEpisodes + 1,
                },
            },
            {
                ...structuredClone(bound.graphCollectionCoverage),
                discovery: {
                    ...structuredClone(bound.graphCollectionCoverage.discovery),
                    directoriesVisited: 1_025,
                },
            },
            {
                ...structuredClone(bound.graphCollectionCoverage),
                discovery: {
                    ...structuredClone(bound.graphCollectionCoverage.discovery),
                    candidatesDiscovered: 4_097,
                },
            },
            {
                ...structuredClone(bound.graphCollectionCoverage),
                observations: {
                    ...structuredClone(bound.graphCollectionCoverage.observations),
                    graphEpisodesSelected: 257,
                },
            },
        ]) {
            await assertShadowInvalidInput(baseInput({
                agentSessionGraphFeed: feed,
                graphCollectionCoverage,
            }));
        }
    });
    (0, node_test_1.it)("fails closed for malformed, unexpected, authority-widening, and oversized inputs", async () => {
        const invalidProducerFragment = semanticFragment([{
                id: "invalid-producer-event",
                pointerId: "invalid-producer-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("invalid-producer-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-12T10:00:00.000Z",
            }]);
        invalidProducerFragment.producer.id = "wrong-producer";
        const invalidFreshnessFragment = semanticFragment([{
                id: "invalid-freshness-event",
                pointerId: "invalid-freshness-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("invalid-freshness-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-12T10:00:00.000Z",
            }]);
        invalidFreshnessFragment.freshness.validThrough =
            "2026-08-17T13:59:59.999Z";
        const malformedCases = [
            { ...baseInput(), unexpected: true },
            { ...baseInput(), requestedAt: "2026-08-17T12:00:00Z" },
            {
                ...baseInput(),
                expectedLegacyFlags: {
                    ...baseInput().expectedLegacyFlags,
                    readAuthority: true,
                },
            },
            {
                ...baseInput(),
                candidateSemanticFragment: {
                    ...semanticFragment([{
                            id: "bad-event",
                            pointerId: "bad-pointer",
                            sourceKind: "gemini_meet",
                            semanticOriginId: digest("bad-origin"),
                            candidateKind: "commitment",
                            occurredAt: "2026-08-12T10:00:00.000Z",
                        }]),
                    ownerScopeDigest: digest("wrong-owner"),
                },
            },
            {
                ...baseInput(),
                candidateSemanticFragment: invalidProducerFragment,
            },
            {
                ...baseInput(),
                candidateSemanticFragment: invalidFreshnessFragment,
            },
            {
                ...baseInput(),
                previousAcceptedRoots: [{
                        rootProposalId: "x".repeat(native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumInputBytes),
                        memberNodeIds: [],
                    }],
            },
        ];
        for (const malformed of malformedCases) {
            await strict_1.default.rejects((0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(malformed), /Task Map native community shadow/);
        }
    });
    (0, node_test_1.it)("rejects semantic evidence timestamps that are not canonical UTC milliseconds", async () => {
        await strict_1.default.rejects((0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            semanticEvidence: {
                station: {
                    provider: {
                        transport: "gemini-remote",
                        executable: "remote-api",
                        args: [],
                        model: "timestamp-fixture-model",
                    },
                    async run(request) {
                        return {
                            stationId: request.stationId,
                            model: "timestamp-fixture-model",
                            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                            inputDigest: request.inputDigest,
                            outputJson: '{"groups":[]}',
                            producedAt: "2026-08-17T05:00:00.000-07:00",
                            transport: "gemini-remote",
                        };
                    },
                },
            },
        })), /Task Map native community shadow/);
    });
    (0, node_test_1.it)("binds semantic fragment freshness to the artifact requestedAt instant", async () => {
        const fragment = () => semanticFragment([{
                id: "freshness-bound-event",
                pointerId: "freshness-bound-pointer",
                sourceKind: "gemini_meet",
                semanticOriginId: digest("freshness-bound-origin"),
                candidateKind: "commitment",
                occurredAt: "2026-08-12T10:00:00.000Z",
            }]);
        const future = fragment();
        future.freshness = {
            ...future.freshness,
            producedAt: "2026-08-17T13:00:00.000Z",
            validThrough: "2026-08-17T17:00:00.000Z",
            assessedAt: "2026-08-17T13:00:00.000Z",
        };
        const expired = fragment();
        expired.freshness = {
            ...expired.freshness,
            producedAt: "2026-08-17T08:00:00.000Z",
            validThrough: REQUESTED_AT,
            assessedAt: "2026-08-17T09:00:00.000Z",
        };
        for (const invalidFragment of [future, expired]) {
            await strict_1.default.rejects((0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
                candidateSemanticFragment: invalidFragment,
            })), (error) => {
                strict_1.default.ok(error instanceof native_community_shadow_js_1.TaskMapNativeCommunityShadowUnavailableError);
                strict_1.default.equal(error.code, "invalid_input");
                return true;
            });
        }
    });
    (0, node_test_1.it)("rejects exact POSIX owner paths in previous root and member IDs", async () => {
        const fixture = await reusableCommunityFixture();
        const safeReuse = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
            ...fixture.input,
            previousAcceptedRoots: [{
                    rootProposalId: "historical-safe-root",
                    memberNodeIds: fixture.memberNodeIds,
                }],
        }));
        strict_1.default.equal(safeReuse.proposalSet.proposals[0]?.rootProposalId, "historical-safe-root");
        const unsafeRootId = "/Users/neo/private/root-proposal";
        await assertPreviousRootPrivacyRejected(baseInput({
            ...fixture.input,
            previousAcceptedRoots: [{
                    rootProposalId: unsafeRootId,
                    memberNodeIds: fixture.memberNodeIds,
                }],
        }), unsafeRootId);
        const unsafeMemberId = "/Users/neo/private/member-node";
        await assertPreviousRootPrivacyRejected(baseInput({
            ...fixture.input,
            previousAcceptedRoots: [{
                    rootProposalId: "historical-safe-root",
                    memberNodeIds: [...fixture.memberNodeIds, unsafeMemberId],
                }],
        }), unsafeMemberId);
    });
    (0, node_test_1.it)("rejects Windows paths, file URIs, credentials, tokens, and ill-formed Unicode in previous roots", async () => {
        const fixture = await reusableCommunityFixture();
        const unsafeCases = [
            "C:\\Users\\neo\\private\\root",
            "file:///Users/neo/private/member-node",
            "token=super-secret-value",
            "ghp_abcdefghijklmnop1234567890",
            "prefix-sk-proj-abcdefghijklmnop-suffix",
            "prefix-grn_abcdefghijkl-suffix",
            "prefix-dbk_abcdefghijkl-suffix",
            "prefix-abcdefgh.ijklmnop.qrstuvwx-suffix",
            "prefix/Users/neo/private-root",
            "historical-owner@example.com",
            "lone-surrogate-\uD800",
        ];
        for (const [index, unsafeValue] of unsafeCases.entries()) {
            await assertPreviousRootPrivacyRejected(baseInput({
                ...fixture.input,
                previousAcceptedRoots: [{
                        rootProposalId: index % 2 === 0
                            ? unsafeValue
                            : `historical-safe-root-${index}`,
                        memberNodeIds: index % 2 === 0
                            ? fixture.memberNodeIds
                            : [...fixture.memberNodeIds, unsafeValue],
                    }],
            }), unsafeValue);
        }
    });
    (0, node_test_1.it)("rejects every malformed previous-root invariant locally as invalid_input", async () => {
        const fixture = await reusableCommunityFixture();
        const member = fixture.memberNodeIds[0];
        const maximumRoots = community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRoots;
        const maximumMembers = community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxMembersPerPreviousRoot;
        const aggregateLimit = community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousMembersTotal;
        const memberIds = (rootIndex, count, length = 0) => Array.from({ length: count }, (_unused, memberIndex) => {
            const prefix = `member-${rootIndex}-${memberIndex}-`;
            return length === 0
                ? prefix.slice(0, -1)
                : prefix + "x".repeat(Math.max(0, length - prefix.length));
        });
        const tooManyRoots = Array.from({ length: maximumRoots + 1 }, (_unused, index) => ({
            rootProposalId: `root-${index}`,
            memberNodeIds: [`member-${index}`],
        }));
        const aggregateRoots = Array.from({ length: Math.ceil((aggregateLimit + 1) / maximumMembers) }, (_unused, index) => {
            const retainedBefore = index * maximumMembers;
            const remaining = aggregateLimit + 1 - retainedBefore;
            return {
                rootProposalId: `aggregate-root-${index}`,
                memberNodeIds: memberIds(index, Math.min(maximumMembers, Math.max(0, remaining))),
            };
        });
        const byteBoundRoots = Array.from({ length: 11 }, (_unused, index) => ({
            rootProposalId: `byte-root-${index}`,
            memberNodeIds: memberIds(index, 372, 280),
        }));
        strict_1.default.ok(Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(byteBoundRoots), "utf8") > community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRootsBytes);
        strict_1.default.ok(Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(baseInput({
            ...fixture.input,
            previousAcceptedRoots: byteBoundRoots,
        })), "utf8") < native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumInputBytes);
        const malformedPreviousRoots = [
            [{ rootProposalId: "", memberNodeIds: [member] }],
            [{ rootProposalId: "empty-members", memberNodeIds: [] }],
            [{ rootProposalId: "duplicate-members", memberNodeIds: [member, member] }],
            [
                { rootProposalId: "duplicate-root", memberNodeIds: [member] },
                { rootProposalId: "duplicate-root", memberNodeIds: [member] },
            ],
            [{
                    rootProposalId: "too-many-members",
                    memberNodeIds: memberIds(0, maximumMembers + 1),
                }],
            tooManyRoots,
            aggregateRoots,
            byteBoundRoots,
        ];
        for (const previousAcceptedRoots of malformedPreviousRoots) {
            await assertShadowInvalidInput(baseInput({
                ...fixture.input,
                previousAcceptedRoots,
            }));
        }
    });
    (0, node_test_1.it)("builds a deterministic, bounded unavailable receipt without error strings", () => {
        const input = baseInput();
        const first = (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadowUnavailableReceipt)({
            ownerScopeDigest: input.ownerScopeDigest,
            requestedAt: input.requestedAt,
            legacyBindings: input.legacyBindings,
            graphCollectionCoverage: input.graphCollectionCoverage,
        });
        const second = (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadowUnavailableReceipt)({
            ownerScopeDigest: input.ownerScopeDigest,
            requestedAt: input.requestedAt,
            legacyBindings: input.legacyBindings,
            graphCollectionCoverage: input.graphCollectionCoverage,
        });
        strict_1.default.deepEqual(second, first);
        strict_1.default.equal(first.contractVersion, native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_SHADOW_UNAVAILABLE_VERSION);
        strict_1.default.equal(first.availability, "unavailable");
        strict_1.default.equal(first.authority, "none");
        strict_1.default.equal(first.readAuthority, false);
        strict_1.default.equal(Object.hasOwn(first, "error"), false);
        strict_1.default.equal(Object.hasOwn(first, "reason"), false);
        strict_1.default.ok(Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(first), "utf8") < 2_048);
    });
    (0, node_test_1.it)("records the community title envelope and replays it without the title station", async () => {
        const replayRoot = await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-title-replay-"));
        try {
            const titleReplayPath = node_path_1.default.join(replayRoot, "llm-envelopes", "community-title-v1");
            const feed = agentFeed([
                agentEpisode("title-replay-a", undefined, digest("title-replay-directive-a")),
                agentEpisode("title-replay-b", "2026-08-12T10:00:00.000Z", digest("title-replay-directive-b")),
            ]);
            let titleCalls = 0;
            const liveStation = (onTitle) => ({
                provider: {
                    transport: "gemini-remote",
                    executable: "injected-title-replay-station",
                    args: [],
                    model: "title-replay-fixture",
                },
                async run(request) {
                    if (request.stationId === "community-title-v1") {
                        return onTitle();
                    }
                    const payload = JSON.parse(request.promptText.split("\n").at(-1) ?? "{}");
                    return {
                        stationId: request.stationId,
                        model: "title-replay-fixture",
                        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                        inputDigest: request.inputDigest,
                        outputJson: JSON.stringify({
                            groups: [{
                                    nodeIds: (payload.nodes ?? []).map((node) => node.nodeId),
                                }],
                        }),
                        producedAt: REQUESTED_AT,
                        transport: "gemini-remote",
                    };
                },
            });
            const titleEnvelope = (promptText, inputDigest) => {
                titleCalls += 1;
                const payload = JSON.parse(promptText.split("\n").at(-1) ?? "{}");
                return {
                    stationId: "community-title-v1",
                    model: "title-replay-fixture",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(promptText),
                    inputDigest,
                    outputJson: JSON.stringify({
                        titles: (payload.communities ?? []).map((community) => ({
                            baseRootProposalId: community.baseRootProposalId,
                            title: "Recorded replay workstream",
                        })),
                    }),
                    producedAt: REQUESTED_AT,
                    transport: "gemini-remote",
                };
            };
            const recordingStation = {
                ...liveStation(() => {
                    throw new Error("unused");
                }),
                async run(request) {
                    if (request.stationId === "community-title-v1") {
                        return titleEnvelope(request.promptText, request.inputDigest);
                    }
                    return liveStation(() => {
                        throw new Error("unused");
                    }).run(request);
                },
            };
            const first = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
                agentSessionGraphFeed: feed,
                semanticEvidence: {
                    station: recordingStation,
                    titleReplayPath,
                },
            }));
            strict_1.default.equal(titleCalls, 1);
            strict_1.default.equal(first.proposalSet.titleGeneration?.source, "live_station");
            strict_1.default.equal(first.proposalSet.proposals[0]?.title, "Recorded replay workstream");
            const recordedFiles = await (0, promises_1.readdir)(titleReplayPath);
            strict_1.default.equal(recordedFiles.length, 1);
            strict_1.default.match(recordedFiles[0], /^[a-f0-9]{64}\.json$/);
            const throwingTitleStation = {
                ...recordingStation,
                async run(request) {
                    if (request.stationId === "community-title-v1") {
                        throw new Error("title station must replay from disk");
                    }
                    return recordingStation.run(request);
                },
            };
            const second = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
                agentSessionGraphFeed: feed,
                semanticEvidence: {
                    station: throwingTitleStation,
                    titleReplayPath,
                },
            }));
            strict_1.default.equal(titleCalls, 1);
            strict_1.default.equal(second.proposalSet.titleGeneration?.source, "recorded_replay");
            strict_1.default.deepEqual(second.proposalSet.proposals, first.proposalSet.proposals);
            // A corrupted recording must fall back to the live station instead of
            // failing the plan.
            await (0, promises_1.writeFile)(node_path_1.default.join(titleReplayPath, recordedFiles[0]), "{\"not\":\"an envelope\"}", { mode: 0o600 });
            const third = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
                agentSessionGraphFeed: feed,
                semanticEvidence: {
                    station: recordingStation,
                    titleReplayPath,
                },
            }));
            strict_1.default.equal(titleCalls, 2);
            strict_1.default.equal(third.proposalSet.titleGeneration?.source, "live_station");
            strict_1.default.deepEqual(third.proposalSet.proposals, first.proposalSet.proposals);
            // The corrupted recording was evicted and re-recorded, so replay
            // works again without the station.
            const fourth = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityShadow)(baseInput({
                agentSessionGraphFeed: feed,
                semanticEvidence: {
                    station: throwingTitleStation,
                    titleReplayPath,
                },
            }));
            strict_1.default.equal(titleCalls, 2);
            strict_1.default.equal(fourth.proposalSet.titleGeneration?.source, "recorded_replay");
        }
        finally {
            await (0, promises_1.rm)(replayRoot, { recursive: true, force: true });
        }
    });
});
