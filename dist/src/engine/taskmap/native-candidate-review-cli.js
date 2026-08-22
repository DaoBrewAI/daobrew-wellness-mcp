#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES = exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN = void 0;
exports.retainReceiptBackedPendingRows = retainReceiptBackedPendingRows;
exports.parseTaskMapNativeCandidateReviewCommand = parseTaskMapNativeCandidateReviewCommand;
exports.taskMapNativeCandidateReviewOverlayPath = taskMapNativeCandidateReviewOverlayPath;
exports.runTaskMapNativeCandidateReviewCommand = runTaskMapNativeCandidateReviewCommand;
exports.taskMapNativeCandidateShelfOutput = taskMapNativeCandidateShelfOutput;
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const identity_js_1 = require("../../identity.js");
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
const agent_session_producer_freshness_js_1 = require("./agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("./agent-session-semantic-admission.js");
const agent_session_refresh_llm_replay_js_1 = require("./agent-session-refresh-llm-replay.js");
const agent_session_candidate_adapter_js_1 = require("./agent-session-candidate-adapter.js");
const calendar_candidate_adapter_js_1 = require("./calendar-candidate-adapter.js");
const calendar_producer_freshness_js_1 = require("./calendar-producer-freshness.js");
const calendar_refresh_llm_replay_js_1 = require("./calendar-refresh-llm-replay.js");
const meeting_producer_freshness_js_1 = require("./meeting-producer-freshness.js");
const meeting_refresh_llm_replay_js_1 = require("./meeting-refresh-llm-replay.js");
const native_refresh_service_js_1 = require("./native-refresh-service.js");
const native_semantic_builder_adapter_js_1 = require("./native-semantic-builder-adapter.js");
const native_community_shadow_js_1 = require("./native-community-shadow.js");
const community_task_digestion_js_1 = require("./community-task-digestion.js");
const native_refresh_service_js_2 = require("./native-refresh-service.js");
const native_candidate_hierarchy_js_1 = require("./native-candidate-hierarchy.js");
const native_candidate_acceptance_js_1 = require("./native-candidate-acceptance.js");
const native_candidate_review_js_1 = require("./native-candidate-review.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN = "taskmap-native-candidate-review-cli-idempotency.1";
exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES = 128 * 1024;
const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const OVERLAY_FILE_NAME = "native-candidate-review.v1.json";
const ACCEPTANCE_FILE_NAME = "native-candidate-acceptance.v1.json";
const USAGE = "usage: native-candidate-review-cli --list | "
    + "--review <candidateId> --revision <64hex> "
    + "--action accept_for_review|dismiss";
function retainReceiptBackedPendingRows(candidates, acceptanceStore, publishedPromotionIds) {
    if (acceptanceStore === null) {
        return { candidates: [...candidates], durableConfirmedCandidateIds: [] };
    }
    const byCandidateId = new Map(candidates.map((candidate) => [
        candidate.candidateId,
        candidate,
    ]));
    for (const receipt of acceptanceStore.receipts) {
        if (publishedPromotionIds.has(receipt.promotionId))
            continue;
        const current = byCandidateId.get(receipt.candidateId);
        const currentMatchesReceipt = current !== undefined
            && current.candidateRevisionDigest === receipt.candidateRevisionDigest
            && current.statementReferenceDigest === receipt.statementReferenceDigest
            && current.evidenceProofDigests.length === receipt.evidenceProofDigests.length
            && current.evidenceProofDigests.every((proof, index) => proof === receipt.evidenceProofDigests[index]);
        if (currentMatchesReceipt)
            continue;
        const pending = {
            candidateId: receipt.candidateId,
            candidateRevisionDigest: receipt.candidateRevisionDigest,
            statementReferenceDigest: receipt.statementReferenceDigest,
            evidenceProofDigests: [...receipt.evidenceProofDigests],
            candidateFamily: "accepted_pending",
            kind: receipt.accepted.kind,
            title: receipt.accepted.title,
            summary: receipt.accepted.summary,
            speechActClass: receipt.accepted.speechActClass,
            speechActActor: receipt.accepted.speechActActor,
            confidence: receipt.accepted.confidence,
            mentionIdentityDigest: receipt.accepted.mentionIdentityDigest,
            sourceKinds: ["accepted_pending"],
            occurredAt: receipt.accepted.occurredAt,
            observedAt: receipt.accepted.observedAt,
            reviewState: "unreviewed",
            reviewedAt: null,
            reviewedOnly: false,
            promotionEligible: false,
            acceptedWork: false,
            sourceWritebackEligible: false,
            rankEligible: false,
            routeEligible: false,
            proveEligible: false,
            runEligible: false,
        };
        byCandidateId.set(pending.candidateId, pending);
    }
    const retained = [...byCandidateId.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
    const durableConfirmedCandidateIds = [...new Set(acceptanceStore.receipts.flatMap((receipt) => !publishedPromotionIds.has(receipt.promotionId)
            && byCandidateId.has(receipt.candidateId)
            ? [receipt.candidateId]
            : []))].sort();
    return { candidates: retained, durableConfirmedCandidateIds };
}
function usageError() {
    throw new TypeError(USAGE);
}
function parseTaskMapNativeCandidateReviewCommand(argv) {
    if (argv.length === 1 && argv[0] === "--list") {
        return { kind: "list" };
    }
    if (argv.length !== 6
        || argv[0] !== "--review"
        || !CANDIDATE_ID.test(argv[1] ?? "")
        || argv[2] !== "--revision"
        || !SHA256.test(argv[3] ?? "")
        || argv[4] !== "--action"
        || (argv[5] !== "accept_for_review" && argv[5] !== "dismiss")) {
        usageError();
    }
    return {
        kind: "review",
        candidateId: argv[1],
        candidateRevisionDigest: argv[3],
        action: argv[5],
    };
}
async function resolveConfirmedOwner(homeDirectory) {
    const environment = (process.env.DAOBREW_USER_ID ?? "").trim();
    const plan = await (0, identity_js_1.loadConfirmedTaskMapOwner)(homeDirectory, environment.length === 0 ? {} : { userId: environment });
    if (!plan.ok) {
        throw new Error("candidate review owner is unavailable");
    }
    return plan.owner;
}
function taskMapNativeCandidateReviewOverlayPath(taskMapRoot) {
    const overlayPath = node_path_1.default.join(taskMapRoot, OVERLAY_FILE_NAME);
    if (!node_path_1.default.isAbsolute(overlayPath)
        || node_path_1.default.normalize(overlayPath) !== overlayPath) {
        throw new Error("candidate review storage is unavailable");
    }
    return overlayPath;
}
function idempotencyKeyDigest(input) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN,
        ownerScopeDigest: input.ownerScopeDigest,
        candidateId: input.candidateId,
        candidateRevisionDigest: input.candidateRevisionDigest,
        action: input.action,
    });
}
async function persistWhenChanged(overlayPath, expectedOwnerScopeDigest, previous, current) {
    if (previous !== null
        && (0, native_candidate_review_js_1.taskMapNativeCandidateReviewCanonicalBytes)(previous)
            === (0, native_candidate_review_js_1.taskMapNativeCandidateReviewCanonicalBytes)(current)) {
        return;
    }
    await (0, native_candidate_review_js_1.writeTaskMapNativeCandidateReview)({
        overlayPath,
        expectedOwnerScopeDigest,
        overlay: current,
    });
}
function reviewHierarchyCoverage(inputObservations, selectedEpisodes, deduplicatedEpisodes) {
    return {
        contractVersion: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION,
        discovery: {
            directoriesVisited: 0,
            candidatesDiscovered: inputObservations,
            directoryLimit: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.directoryLimit,
            candidateLimit: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.candidateLimit,
            directoryLimitReached: false,
            candidateLimitReached: false,
        },
        reads: {
            attemptedFiles: 0,
            attemptLimit: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.attemptLimit,
            droppedAttemptLimit: 0,
            droppedInvalid: 0,
        },
        scan: {
            chargedBytes: 0,
            globalByteLimit: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.globalScanByteLimit,
            perFileByteLimit: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.perFileScanByteLimit,
            droppedScanBudget: 0,
        },
        observations: {
            selectedObservations: inputObservations,
            observationLimit: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.observationLimit,
            droppedObservationLimit: 0,
            rawBytesSelected: 0,
            rawByteLimit: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.rawByteLimit,
            droppedRawByteBudget: 0,
            graphEpisodesSelected: selectedEpisodes,
            maxGraphEpisodes: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.maxGraphEpisodes,
            droppedGraphEpisodes: Math.max(0, deduplicatedEpisodes - selectedEpisodes),
        },
        distribution: { codexSelected: 0, claudeSelected: 0, isoWeeksSelected: 0 },
        completeness: "unknown",
        truncationReasons: ["not_collected"],
        authority: "none",
        privacy: {
            pathsPersisted: false,
            textPersisted: false,
            secretsPersisted: false,
            vectorsPersisted: false,
        },
    };
}
const DETERMINISTIC_TOPIC_STOPWORDS = new Set([
    "about", "add", "after", "again", "also", "and", "before", "build",
    "can", "complete", "create", "current", "decide", "ensure", "fix",
    "for", "from", "implement", "into", "local", "make", "new", "now",
    "replace", "review", "run", "task", "tasks", "taskmap", "test", "that",
    "the", "this", "tdd", "then", "use", "using", "with", "work",
]);
function deterministicTopicTokens(value) {
    return [...new Set(value
            .normalize("NFKC")
            .toLocaleLowerCase("en-US")
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2 && !DETERMINISTIC_TOPIC_STOPWORDS.has(token)))].sort();
}
function deterministicCandidateFallback(input) {
    const candidates = input.candidates
        .filter((candidate) => input.candidateIds.includes(candidate.candidateId))
        .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
    const existingBindings = new Map(input.candidateNodeBindings.map((binding) => [
        binding.candidateId,
        binding.nodeIds,
    ]));
    const bindings = candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        nodeIds: existingBindings.get(candidate.candidateId)
            ?? [`candidate-fallback:${candidate.candidateId}`],
    }));
    const tokenSets = candidates.map((candidate) => new Set(deterministicTopicTokens(`${candidate.title} ${candidate.summary}`)));
    const parents = candidates.map((_, index) => index);
    const find = (index) => {
        let root = index;
        while (parents[root] !== root)
            root = parents[root];
        while (parents[index] !== index) {
            const next = parents[index];
            parents[index] = root;
            index = next;
        }
        return root;
    };
    const join = (left, right) => {
        const leftRoot = find(left);
        const rightRoot = find(right);
        if (leftRoot !== rightRoot)
            parents[rightRoot] = leftRoot;
    };
    for (let left = 0; left < candidates.length; left += 1) {
        for (let right = left + 1; right < candidates.length; right += 1) {
            const leftCandidate = candidates[left];
            const rightCandidate = candidates[right];
            const sameExtractedTopic = "originIdentityDigest" in leftCandidate
                && "originIdentityDigest" in rightCandidate
                && leftCandidate.originIdentityDigest === rightCandidate.originIdentityDigest;
            const sharedSemanticToken = [...tokenSets[left]].some((token) => tokenSets[right].has(token));
            if (sameExtractedTopic || sharedSemanticToken)
                join(left, right);
        }
    }
    const grouped = new Map();
    for (let index = 0; index < candidates.length; index += 1) {
        const root = find(index);
        grouped.set(root, [...(grouped.get(root) ?? []), index]);
    }
    const singletonIndexes = [];
    const clusters = [...grouped.values()].filter((indexes) => {
        if (indexes.length > 1)
            return true;
        singletonIndexes.push(indexes[0]);
        return false;
    });
    if (singletonIndexes.length > 0)
        clusters.push(singletonIndexes);
    const proposalRows = clusters.map((indexes) => {
        const clusterCandidates = indexes.map((index) => candidates[index]);
        const memberCandidateIds = clusterCandidates.map((row) => row.candidateId).sort();
        const tokenCounts = new Map();
        for (const index of indexes) {
            for (const token of tokenSets[index]) {
                tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
            }
        }
        const commonTokens = [...tokenCounts]
            .filter(([, count]) => count >= Math.max(2, Math.ceil(indexes.length / 2)))
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 3)
            .map(([token]) => token);
        const title = commonTokens.length > 0
            ? commonTokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" · ")
            : indexes.length === 1
                ? clusterCandidates[0].title.slice(0, 120)
                : "Other work";
        const rootProposalId = `tmcandidatefallback_${(0, source_contracts_js_1.taskMapContractDigest)({
            memberCandidateIds,
            title,
        }).slice(0, 32)}`;
        const memberNodeIds = bindings
            .filter((binding) => memberCandidateIds.includes(binding.candidateId))
            .flatMap((binding) => binding.nodeIds)
            .filter((nodeId, index, values) => values.indexOf(nodeId) === index)
            .sort();
        return {
            rootProposalId,
            title,
            titleSource: "deterministic_fallback",
            memberNodeIds,
        };
    }).sort((left, right) => left.rootProposalId.localeCompare(right.rootProposalId));
    return { proposals: proposalRows, candidateNodeBindings: bindings };
}
async function addEngineAuthoredCandidateHierarchy(input) {
    let hierarchy;
    try {
        let semanticFragment = input.meetingResult === null
            ? (0, native_refresh_service_js_1.emptyTaskMapSemanticInputForAcceptedReceipts)(input.ownerScopeDigest, input.assessedAt)
            : (0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputFromMeetingProducerResult)(input.meetingResult, input.ownerScopeDigest);
        if (input.granolaReport !== null) {
            semanticFragment = (0, native_refresh_service_js_1.mergeTaskMapSemanticFragment)(semanticFragment, (0, meeting_refresh_llm_replay_js_1.buildTaskMapGranolaSemanticFragment)(input.granolaReport));
        }
        if (input.calendarExtraction !== null) {
            semanticFragment = (0, native_refresh_service_js_1.mergeTaskMapSemanticFragment)(semanticFragment, (0, calendar_refresh_llm_replay_js_1.buildTaskMapCalendarSemanticFragment)(input.calendarResult, input.calendarExtraction));
        }
        const feed = input.agentSnapshot === null
            ? null
            : (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeedFromSnapshot)(input.agentSnapshot);
        const plan = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityPlan)({
            ownerScopeDigest: input.ownerScopeDigest,
            requestedAt: input.assessedAt,
            agentSessionGraphFeed: feed,
            graphCollectionCoverage: reviewHierarchyCoverage(feed?.counts.inputObservations ?? 0, feed?.counts.selectedEpisodes ?? 0, feed?.counts.deduplicatedEpisodes ?? 0),
            candidateSemanticFragment: semanticFragment,
            semanticEvidence: {
                station: null,
                embeddingProvider: null,
                embeddingModelId: null,
                groupingReplayPath: node_path_1.default.join(input.taskMapRoot, "llm-envelopes", "community-grouping-v1"),
                embeddingCachePath: node_path_1.default.join(input.taskMapRoot, "llm-envelopes", "community-embeddings.v1.json"),
                titleReplayPath: node_path_1.default.join(input.taskMapRoot, "llm-envelopes", "community-title-v1"),
            },
            previousAcceptedRoots: [],
        });
        const semanticBindings = (0, native_community_shadow_js_1.taskMapNativeCommunityCandidateNodeBindings)(semanticFragment, input.ownerScopeDigest, input.assessedAt);
        const semanticNodeByStatement = new Map(semanticBindings.map((binding) => [
            binding.statementReferenceDigest,
            binding.nodeId,
        ]));
        const candidateNodeBindings = input.shelf.candidates.map((candidate) => {
            if (candidate.candidateFamily !== "agent_session") {
                const nodeId = semanticNodeByStatement.get(candidate.statementReferenceDigest);
                return { candidateId: candidate.candidateId, nodeIds: nodeId === undefined ? [] : [nodeId] };
            }
            const cluster = input.agentAdmission?.clusters.find((value) => value.clusterIdentityDigest === candidate.originIdentityDigest);
            const nodeIds = cluster === undefined || feed === null ? [] : feed.episodes
                .filter((episode) => episode.workstreamIdentityDigest === cluster.workstreamIdentityDigest
                && episode.directiveSemanticDigest === cluster.directiveSemanticDigest)
                .map((episode) => episode.graphEpisodeId)
                .sort();
            return { candidateId: candidate.candidateId, nodeIds };
        }).filter((binding) => binding.nodeIds.length > 0);
        const subtasks = [];
        if (feed !== null && plan.groupingAvailable) {
            const rootEvidence = (0, native_community_shadow_js_1.buildTaskMapNativeCommunityRootEvidence)({
                plan,
                feed,
                generatedAt: input.assessedAt,
                currentAdmission: input.agentAdmission,
            });
            const report = await (0, community_task_digestion_js_1.loadTaskMapCommunityTaskDigestionReport)(node_path_1.default.join(input.runtimeRoot, native_refresh_service_js_2.TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME));
            const episodeByRef = new Map(feed.episodes.map((episode) => [
                `episode:${episode.episodeIdentityDigest}`,
                episode.graphEpisodeId,
            ]));
            const nodeByEvidence = new Map(rootEvidence.taskMapInput.events.flatMap((event) => {
                const nodeId = event.objectRefs.map((reference) => episodeByRef.get(reference)).find((value) => value !== undefined);
                return nodeId === undefined ? [] : [[event.id, nodeId]];
            }));
            const currentRootIDs = new Set(rootEvidence.rootProposals.map((root) => root.proposalId));
            for (const root of report?.roots ?? []) {
                if (!currentRootIDs.has(root.rootProposalId))
                    continue;
                for (const task of root.tasks) {
                    const memberNodeIds = task.evidenceEventIds.flatMap((eventId) => {
                        const nodeId = nodeByEvidence.get(eventId);
                        return nodeId === undefined ? [] : [nodeId];
                    });
                    if (memberNodeIds.length === 0)
                        continue;
                    subtasks.push({
                        rootProposalId: root.rootProposalId,
                        subtaskId: task.taskProposalId,
                        title: task.title,
                        summary: task.summary,
                        memberNodeIds: [...new Set(memberNodeIds)].sort(),
                    });
                }
            }
        }
        const baseHierarchy = (0, native_candidate_hierarchy_js_1.buildTaskMapNativeCandidateHierarchy)({
            producerSnapshotDigest: input.shelf.producerSnapshotDigest,
            candidateIds: input.shelf.candidates.map((candidate) => candidate.candidateId),
            groupingAvailable: plan.groupingAvailable || plan.proposalSet.proposals.length > 0,
            proposals: plan.proposalSet.proposals,
            candidateNodeBindings,
            subtasks,
        });
        if (baseHierarchy.ungroupedCandidateIds.length === 0) {
            hierarchy = baseHierarchy;
        }
        else {
            const fallback = deterministicCandidateFallback({
                candidates: input.shelf.candidates,
                candidateNodeBindings,
                candidateIds: baseHierarchy.ungroupedCandidateIds,
            });
            hierarchy = (0, native_candidate_hierarchy_js_1.buildTaskMapNativeCandidateHierarchy)({
                producerSnapshotDigest: input.shelf.producerSnapshotDigest,
                candidateIds: input.shelf.candidates.map((candidate) => candidate.candidateId),
                groupingAvailable: true,
                proposals: [...plan.proposalSet.proposals, ...fallback.proposals],
                candidateNodeBindings: [
                    ...candidateNodeBindings.filter((binding) => !baseHierarchy.ungroupedCandidateIds.includes(binding.candidateId)),
                    ...fallback.candidateNodeBindings,
                ],
                subtasks,
            });
        }
    }
    catch {
        hierarchy = (0, native_candidate_hierarchy_js_1.buildTaskMapNativeCandidateHierarchy)({
            producerSnapshotDigest: input.shelf.producerSnapshotDigest,
            candidateIds: input.shelf.candidates.map((candidate) => candidate.candidateId),
            groupingAvailable: false,
            proposals: [],
            candidateNodeBindings: [],
            subtasks: [],
        });
    }
    const shelf = {
        ...input.shelf,
        contractVersion: native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3,
        durableConfirmedCandidateIds: input.durableConfirmedCandidateIds,
        hierarchy,
    };
    (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV3)(shelf);
    return shelf;
}
async function runTaskMapNativeCandidateReviewCommand(argv) {
    const command = parseTaskMapNativeCandidateReviewCommand(argv);
    const ownerHome = (0, node_os_1.homedir)();
    const owner = await resolveConfirmedOwner(ownerHome);
    const expectedOwnerScopeDigest = owner.ownerScopeDigest;
    const producerPath = node_path_1.default.join(owner.sourceRoot, "meeting-producer-snapshot.v1.json");
    const overlayPath = taskMapNativeCandidateReviewOverlayPath(owner.taskMapRoot);
    return (0, native_candidate_review_js_1.withTaskMapNativeCandidateReviewTransaction)({
        overlayPath,
        expectedOwnerScopeDigest,
    }, async () => {
        const previous = await (0, native_candidate_review_js_1.loadTaskMapNativeCandidateReview)({
            overlayPath,
            expectedOwnerScopeDigest,
        });
        const assessedAt = new Date().toISOString();
        const agentResult = await (0, agent_session_producer_freshness_js_1.loadTaskMapAgentSessionProducerResult)({
            snapshotPath: node_path_1.default.join(owner.sourceRoot, "agent-session-producer-snapshot.v1.json"),
            assessedAt,
            expectedOwnerScopeDigest,
        });
        let agentAdmission = null;
        let agentExtraction = null;
        if (agentResult.freshness.decision !== "missing") {
            if (agentResult.availability !== "available"
                || agentResult.snapshot === null
                || agentResult.freshness.decision !== "fresh"
                || agentResult.freshness.currentSemanticInputEligible !== true) {
                throw new Error("agent candidate evidence is unavailable");
            }
            agentAdmission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)(agentResult.snapshot);
            agentExtraction = await (0, agent_session_refresh_llm_replay_js_1.loadVerifiedTaskMapAgentSessionExtractionReport)({
                admission: agentAdmission,
                taskMapRoot: owner.taskMapRoot,
                runtimeRoot: owner.runtimeRoot,
                ownerScopeDigest: expectedOwnerScopeDigest,
                promptTemplatePath: node_path_1.default.resolve(__dirname, "../../../../prompts/agent-session-extraction-v1.md"),
            });
            if (agentExtraction === null) {
                throw new Error("agent candidate extraction proof is unavailable");
            }
        }
        const localCalendarExportPath = node_path_1.default.join(owner.sourceRoot, "calendar-export.json");
        const googleCalendarSnapshotPath = node_path_1.default.join(owner.sourceRoot, "calendar-google-provider-snapshot.v1.json");
        let calendarResult = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
            localExportPath: localCalendarExportPath,
            googleSnapshotPath: googleCalendarSnapshotPath,
            assessedAt,
            expectedOwnerScopeDigest,
        });
        let calendarExtraction = null;
        if (calendarResult.availability === "available") {
            const proof = await (0, calendar_refresh_llm_replay_js_1.loadCurrentTaskMapCalendarExtractionProof)({
                localExportPath: localCalendarExportPath,
                googleSnapshotPath: googleCalendarSnapshotPath,
                taskMapRoot: owner.taskMapRoot,
                runtimeRoot: owner.runtimeRoot,
                ownerScopeDigest: expectedOwnerScopeDigest,
                promptTemplatePath: node_path_1.default.resolve(__dirname, "../../../../prompts/calendar-extraction-v1.md"),
                currentAssessedAt: assessedAt,
            });
            if (proof === null) {
                throw new Error("calendar candidate extraction proof is unavailable");
            }
            calendarResult = proof.result;
            calendarExtraction = proof.extraction;
        }
        let result = null;
        try {
            result = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
                snapshotPath: producerPath,
                assessedAt,
                expectedOwnerScopeDigest,
            });
            if (result.availability !== "available"
                || result.snapshot === null
                || result.freshness.decision !== "fresh")
                result = null;
        }
        catch {
            result = null;
        }
        let rawReport = null;
        try {
            rawReport = await (0, native_refresh_service_js_1.loadCurrentTaskMapOwnerGranolaExtractionReport)({
                snapshotPath: node_path_1.default.join(owner.sourceRoot, "granola-mcp-snapshot.json"),
                residentReceiptPath: node_path_1.default.join(owner.sourceRoot, "taskmap-resident-receipt.v1.json"),
                assessedAt,
                taskMapRoot: owner.taskMapRoot,
                runtimeRoot: owner.runtimeRoot,
                ownerScopeDigest: expectedOwnerScopeDigest,
                promptTemplatePath: node_path_1.default.resolve(__dirname, "../../../../prompts/mention-extraction-v1.md"),
            });
        }
        catch {
            rawReport = null;
        }
        const finalizeShelf = (shelf, durableConfirmedCandidateIds) => addEngineAuthoredCandidateHierarchy({
            shelf,
            durableConfirmedCandidateIds,
            taskMapRoot: owner.taskMapRoot,
            runtimeRoot: owner.runtimeRoot,
            ownerScopeDigest: expectedOwnerScopeDigest,
            assessedAt,
            meetingResult: result,
            granolaReport: rawReport,
            calendarResult,
            calendarExtraction,
            agentSnapshot: agentResult.snapshot,
            agentAdmission,
        });
        if (agentAdmission !== null || calendarExtraction !== null) {
            let meetingContext = null;
            if (rawReport !== null) {
                let googleCandidates = [];
                if (result !== null) {
                    const googleOverlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
                        result,
                        previous: null,
                        expectedOwnerScopeDigest,
                        assessedAt,
                    });
                    googleCandidates = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, googleOverlay, assessedAt).candidates;
                }
                meetingContext = (0, meeting_refresh_llm_replay_js_1.buildTaskMapUnifiedMeetingCandidateContext)({
                    ownerScopeDigest: expectedOwnerScopeDigest,
                    assessedAt,
                    googleCandidates,
                    googleResultDigest: result?.resultDigest ?? null,
                    googleSnapshotDigest: result?.snapshot?.snapshotDigest ?? null,
                    googleProducedAt: result?.snapshot?.producedAt ?? null,
                    rawReport,
                });
            }
            else if (result !== null && result.snapshot !== null) {
                const meetingOverlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
                    result,
                    previous: null,
                    expectedOwnerScopeDigest,
                    assessedAt,
                });
                const meetingShelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, meetingOverlay, assessedAt);
                meetingContext = {
                    ownerScopeDigest: expectedOwnerScopeDigest,
                    producerResultDigest: result.resultDigest,
                    producerSnapshotDigest: result.snapshot.snapshotDigest,
                    producedAt: result.snapshot.producedAt,
                    assessedAt,
                    candidates: meetingShelf.candidates,
                };
            }
            const agentProjection = agentAdmission === null
                ? null
                : (0, agent_session_candidate_adapter_js_1.buildTaskMapAgentSessionCandidateReview)({
                    admission: agentAdmission,
                    extraction: agentExtraction,
                    previous: null,
                    expectedOwnerScopeDigest,
                    assessedAt,
                });
            const calendarProjection = calendarExtraction === null
                ? null
                : (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
                    result: calendarResult,
                    extraction: calendarExtraction,
                    previous: null,
                    expectedOwnerScopeDigest,
                    assessedAt: calendarResult.assessedAt,
                });
            const meetingRows = (meetingContext?.candidates ?? []).map((row) => ({
                ...row,
                evidenceProofDigests: [...row.evidenceProofDigests],
                sourceKinds: [...row.sourceKinds],
                candidateFamily: "meeting",
            }));
            const combinedRows = [
                ...meetingRows,
                ...(agentProjection?.shelf.candidates ?? []),
                ...(calendarProjection?.shelf.candidates ?? []),
            ].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
            const candidateResultDigest = calendarProjection === null
                ? meetingContext === null
                    ? agentProjection.shelf.producerResultDigest
                    : (0, source_contracts_js_1.taskMapContractDigest)({
                        domain: "taskmap-unified-candidate-review-result.2",
                        meetingResultDigest: meetingContext.producerResultDigest,
                        agentResultDigest: agentProjection.shelf.producerResultDigest,
                    })
                : (0, source_contracts_js_1.taskMapContractDigest)({
                    domain: "taskmap-unified-candidate-review-result.3",
                    meetingResultDigest: meetingContext?.producerResultDigest ?? null,
                    agentResultDigest: agentProjection?.shelf.producerResultDigest ?? null,
                    calendarResultDigest: calendarProjection.shelf.producerResultDigest,
                });
            const candidateSnapshotDigest = calendarProjection === null
                ? meetingContext === null
                    ? agentProjection.shelf.producerSnapshotDigest
                    : (0, source_contracts_js_1.taskMapContractDigest)({
                        domain: "taskmap-unified-candidate-review-snapshot.2",
                        meetingSnapshotDigest: meetingContext.producerSnapshotDigest,
                        agentSnapshotDigest: agentProjection.shelf.producerSnapshotDigest,
                    })
                : (0, source_contracts_js_1.taskMapContractDigest)({
                    domain: "taskmap-unified-candidate-review-snapshot.3",
                    meetingSnapshotDigest: meetingContext?.producerSnapshotDigest ?? null,
                    agentSnapshotDigest: agentProjection?.shelf.producerSnapshotDigest ?? null,
                    calendarSnapshotDigest: calendarProjection.shelf.producerSnapshotDigest,
                });
            const producedAt = [
                meetingContext?.producedAt,
                agentAdmission?.producedAt,
                calendarProjection === null ? undefined : calendarResult.assessedAt,
            ].filter((value) => value !== undefined)
                .sort()
                .at(-1);
            const context = {
                ownerScopeDigest: expectedOwnerScopeDigest,
                producerResultDigest: candidateResultDigest,
                producerSnapshotDigest: candidateSnapshotDigest,
                producedAt,
                assessedAt,
                candidates: combinedRows,
            };
            const current = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReviewFromProofRows)({
                context,
                previous,
            });
            const reviewed = command.kind === "list"
                ? current
                : (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReviewFromProofRows)({
                    context,
                    overlay: current,
                    candidateId: command.candidateId,
                    expectedCandidateRevisionDigest: command.candidateRevisionDigest,
                    action: command.action,
                    idempotencyKeyDigest: idempotencyKeyDigest({
                        ownerScopeDigest: expectedOwnerScopeDigest,
                        candidateId: command.candidateId,
                        candidateRevisionDigest: command.candidateRevisionDigest,
                        action: command.action,
                    }),
                    decidedAt: assessedAt,
                });
            await persistWhenChanged(overlayPath, expectedOwnerScopeDigest, previous, reviewed);
            const acceptanceStore = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
                storePath: node_path_1.default.join(owner.taskMapRoot, ACCEPTANCE_FILE_NAME),
                expectedOwnerScopeDigest,
            });
            const publishedPromotionIds = await (0, native_refresh_service_js_1.acceptedPromotionIdsInVerifiedTaskMapProjection)(owner.taskMapRoot, expectedOwnerScopeDigest);
            const reviewedRows = (0, native_candidate_review_js_1.applyTaskMapNativeCandidateReviewToProofRows)({
                context,
                overlay: reviewed,
            });
            const currentCandidates = (0, native_candidate_acceptance_js_1.filterTaskMapNativeCandidateShelfAgainstAcceptanceStore)(reviewedRows, acceptanceStore, expectedOwnerScopeDigest, publishedPromotionIds);
            const retained = retainReceiptBackedPendingRows(currentCandidates, acceptanceStore, publishedPromotionIds);
            const shelf = {
                contractVersion: native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
                ownerScopeDigest: expectedOwnerScopeDigest,
                producerResultDigest: context.producerResultDigest,
                producerSnapshotDigest: context.producerSnapshotDigest,
                assessedAt,
                candidates: retained.candidates,
                displayTextPersistence: "memory_only",
            };
            (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(shelf);
            return finalizeShelf(shelf, retained.durableConfirmedCandidateIds);
        }
        if (rawReport === null) {
            if (result === null)
                throw new Error("candidate evidence is unavailable");
            const current = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
                result,
                previous,
                expectedOwnerScopeDigest,
                assessedAt,
            });
            const reviewed = command.kind === "list"
                ? current
                : (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReview)({
                    result,
                    overlay: current,
                    expectedOwnerScopeDigest,
                    assessedAt,
                    candidateId: command.candidateId,
                    expectedCandidateRevisionDigest: command.candidateRevisionDigest,
                    action: command.action,
                    idempotencyKeyDigest: idempotencyKeyDigest({
                        ownerScopeDigest: expectedOwnerScopeDigest,
                        candidateId: command.candidateId,
                        candidateRevisionDigest: command.candidateRevisionDigest,
                        action: command.action,
                    }),
                    decidedAt: assessedAt,
                });
            await persistWhenChanged(overlayPath, expectedOwnerScopeDigest, previous, reviewed);
            const shelf = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, reviewed, assessedAt);
            const acceptanceStore = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
                storePath: node_path_1.default.join(owner.taskMapRoot, ACCEPTANCE_FILE_NAME),
                expectedOwnerScopeDigest,
            });
            const publishedPromotionIds = await (0, native_refresh_service_js_1.acceptedPromotionIdsInVerifiedTaskMapProjection)(owner.taskMapRoot, expectedOwnerScopeDigest);
            const candidates = (0, native_candidate_acceptance_js_1.filterTaskMapNativeCandidateShelfAgainstAcceptanceStore)(shelf.candidates, acceptanceStore, expectedOwnerScopeDigest, publishedPromotionIds);
            const upgraded = (0, native_candidate_review_js_1.upgradeTaskMapNativeCandidateShelfV1)({
                ...shelf,
                candidates,
            });
            const retained = retainReceiptBackedPendingRows(upgraded.candidates, acceptanceStore, publishedPromotionIds);
            return finalizeShelf({
                ...upgraded,
                candidates: retained.candidates,
            }, retained.durableConfirmedCandidateIds);
        }
        let googleCandidates = [];
        if (result !== null) {
            const googleOverlay = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
                result,
                previous,
                expectedOwnerScopeDigest,
                assessedAt,
            });
            googleCandidates = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateShelf)(result, googleOverlay, assessedAt).candidates;
        }
        const context = (0, meeting_refresh_llm_replay_js_1.buildTaskMapUnifiedMeetingCandidateContext)({
            ownerScopeDigest: expectedOwnerScopeDigest,
            assessedAt,
            googleCandidates,
            googleResultDigest: result?.resultDigest ?? null,
            googleSnapshotDigest: result?.snapshot?.snapshotDigest ?? null,
            googleProducedAt: result?.snapshot?.producedAt ?? null,
            rawReport,
        });
        const current = (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReviewFromProofRows)({
            context,
            previous,
        });
        const reviewed = command.kind === "list"
            ? current
            : (0, native_candidate_review_js_1.reduceTaskMapNativeCandidateReviewFromProofRows)({
                context,
                overlay: current,
                candidateId: command.candidateId,
                expectedCandidateRevisionDigest: command.candidateRevisionDigest,
                action: command.action,
                idempotencyKeyDigest: idempotencyKeyDigest({
                    ownerScopeDigest: expectedOwnerScopeDigest,
                    candidateId: command.candidateId,
                    candidateRevisionDigest: command.candidateRevisionDigest,
                    action: command.action,
                }),
                decidedAt: assessedAt,
            });
        await persistWhenChanged(overlayPath, expectedOwnerScopeDigest, previous, reviewed);
        const acceptanceStore = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath: node_path_1.default.join(owner.taskMapRoot, ACCEPTANCE_FILE_NAME),
            expectedOwnerScopeDigest,
        });
        const publishedPromotionIds = await (0, native_refresh_service_js_1.acceptedPromotionIdsInVerifiedTaskMapProjection)(owner.taskMapRoot, expectedOwnerScopeDigest);
        const candidates = (0, native_candidate_acceptance_js_1.filterTaskMapNativeCandidateShelfAgainstAcceptanceStore)((0, native_candidate_review_js_1.applyTaskMapNativeCandidateReviewToProofRows)({ context, overlay: reviewed }), acceptanceStore, expectedOwnerScopeDigest, publishedPromotionIds);
        const upgraded = (0, native_candidate_review_js_1.upgradeTaskMapNativeCandidateShelfV1)({
            contractVersion: native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION,
            ownerScopeDigest: expectedOwnerScopeDigest,
            producerResultDigest: context.producerResultDigest,
            producerSnapshotDigest: context.producerSnapshotDigest,
            assessedAt,
            candidates,
            displayTextPersistence: "memory_only",
        });
        const retained = retainReceiptBackedPendingRows(upgraded.candidates, acceptanceStore, publishedPromotionIds);
        return finalizeShelf({
            ...upgraded,
            candidates: retained.candidates,
        }, retained.durableConfirmedCandidateIds);
    });
}
function taskMapNativeCandidateShelfOutput(shelf) {
    if (shelf.contractVersion === native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3) {
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV3)(shelf);
    }
    else if (shelf.contractVersion === native_candidate_review_js_1.TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2) {
        (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(shelf);
    }
    const output = (0, source_contracts_js_1.taskMapContractCanonicalJson)(shelf);
    if (Buffer.byteLength(output, "utf8")
        > exports.TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES) {
        throw new Error("candidate review output is unavailable");
    }
    return output;
}
async function main() {
    try {
        const shelf = await runTaskMapNativeCandidateReviewCommand(process.argv.slice(2));
        process.stdout.write(`${taskMapNativeCandidateShelfOutput(shelf)}\n`);
    }
    catch (error) {
        process.stderr.write(`taskmap-native-candidate-review: unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        process.exitCode = 1;
    }
}
if (require.main === module) {
    void main();
}
