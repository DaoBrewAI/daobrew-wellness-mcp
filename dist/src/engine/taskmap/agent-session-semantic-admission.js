"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2 = exports.TASKMAP_AGENT_SESSION_GRAPH_EPISODE_REVISION_DOMAIN = exports.TASKMAP_AGENT_SESSION_GRAPH_EPISODE_IDENTITY_DOMAIN = exports.TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION = exports.TASKMAP_AGENT_SESSION_PROPOSAL_CLUSTER_IDENTITY_DOMAIN = exports.TASKMAP_AGENT_SESSION_WORKSTREAM_IDENTITY_DOMAIN = exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_VERSION = void 0;
exports.taskMapAgentSessionIsoWeek = taskMapAgentSessionIsoWeek;
exports.buildTaskMapAgentSessionGraphFeed = buildTaskMapAgentSessionGraphFeed;
exports.buildTaskMapAgentSessionGraphFeedFromSnapshot = buildTaskMapAgentSessionGraphFeedFromSnapshot;
exports.buildTaskMapAgentSessionSemanticAdmission = buildTaskMapAgentSessionSemanticAdmission;
exports.assertTaskMapAgentSessionSemanticAdmission = assertTaskMapAgentSessionSemanticAdmission;
const agent_session_producer_freshness_js_1 = require("./agent-session-producer-freshness.js");
const source_contracts_js_1 = require("./source-contracts.js");
const text_contract_js_1 = require("./text-contract.js");
exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_VERSION = "taskmap-agent-session-semantic-admission.v2";
exports.TASKMAP_AGENT_SESSION_WORKSTREAM_IDENTITY_DOMAIN = "taskmap-agent-session-workstream-identity.2";
exports.TASKMAP_AGENT_SESSION_PROPOSAL_CLUSTER_IDENTITY_DOMAIN = "taskmap-agent-session-proposal-cluster-identity.2";
exports.TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION = "taskmap-agent-session-graph-feed.v1";
exports.TASKMAP_AGENT_SESSION_GRAPH_EPISODE_IDENTITY_DOMAIN = "taskmap-agent-session-graph-episode-identity.1";
exports.TASKMAP_AGENT_SESSION_GRAPH_EPISODE_REVISION_DOMAIN = "taskmap-agent-session-graph-episode-revision.1";
exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2 = Object.freeze({
    maxClustersPerWorkstream: 8,
    maxClustersGlobal: 24,
    maxSupportKeysPerCluster: 8,
});
const SHA256 = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[a-z][a-z0-9_]{1,31}_[a-f0-9]{16}$/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const UNSAFE_SUMMARY = [
    /\b(?:https?|ftp):\/\//i,
    /\bfile:\/\//i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i,
    /(?:^|[\s("'`])(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)/,
    /(?:^|[\s("'`:=])\/(?!\/)(?!(?:quit|exit)(?:\(\))?(?=$|[\s.,;:!?]))[^\s<>"')\],;]+/,
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]/i,
];
const DISPOSITIONS = [
    "acknowledgement_only",
    "continuity_only",
    "option_only",
    "terminal_control",
    "work_candidate",
];
function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function assertPlainObject(value, label) {
    if (!isPlainObject(value))
        throw new Error(`${label} must be an object`);
}
function assertClosedKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const canonical = [...expected].sort();
    if (actual.length !== canonical.length
        || actual.some((key, index) => key !== canonical[index])) {
        throw new Error(`${label} has unexpected or missing fields`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        throw new Error(`${label} must be a lowercase SHA-256 digest`);
    }
}
function assertCount(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} must be a nonnegative safe integer`);
    }
}
function assertTimestamp(value, label) {
    if (typeof value !== "string"
        || !Number.isFinite(Date.parse(value))
        || new Date(Date.parse(value)).toISOString() !== value) {
        throw new Error(`${label} must be a canonical timestamp`);
    }
}
function assertSafeSummary(value, maximum, label, nullable = false) {
    if (nullable && value === null)
        return;
    if (typeof value !== "string"
        || value.length === 0
        || value.length > maximum
        || (0, text_contract_js_1.toWellFormedText)(value) !== value
        || CONTROL_CHARACTER.test(value)
        || UNSAFE_SUMMARY.some((pattern) => pattern.test(value))) {
        throw new Error(`${label} is not privacy-bounded`);
    }
}
function stableId(prefix, digest) {
    return `${prefix}_${digest.slice(0, 16)}`;
}
function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function compareCodePoint(left, right) {
    const leftScalars = Array.from(left);
    const rightScalars = Array.from(right);
    const sharedLength = Math.min(leftScalars.length, rightScalars.length);
    for (let index = 0; index < sharedLength; index += 1) {
        const difference = leftScalars[index].codePointAt(0)
            - rightScalars[index].codePointAt(0);
        if (difference !== 0)
            return difference;
    }
    return leftScalars.length - rightScalars.length;
}
function compareEpisodeRecency(left, right) {
    const occurred = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    if (occurred !== 0)
        return occurred;
    const observed = Date.parse(right.observedAt) - Date.parse(left.observedAt);
    if (observed !== 0)
        return observed;
    return left.episodeId.localeCompare(right.episodeId);
}
function routeEpisode(ownerScopeDigest, episode) {
    const repository = episode.routing.providerNeutralRepositoryIdentityDigests[0];
    const project = episode.routing.providerNeutralProjectIdentityDigests[0];
    const routingKind = repository !== undefined ? "repository"
        : project !== undefined ? "project"
            : null;
    const providerNeutralRoutingDigest = repository ?? project;
    if (routingKind === null || providerNeutralRoutingDigest === undefined) {
        return null;
    }
    const workstreamIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_AGENT_SESSION_WORKSTREAM_IDENTITY_DOMAIN,
        ownerScopeDigest,
        routingKind,
        providerNeutralRoutingDigest,
    });
    return {
        episode,
        routingKind,
        providerNeutralRoutingDigest,
        workstreamIdentityDigest,
    };
}
function taskMapAgentSessionIsoWeek(timestamp) {
    const parsed = new Date(Date.parse(timestamp));
    const date = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const year = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.floor((date.getTime() - yearStart.getTime()) / (7 * 86_400_000)) + 1;
    return `${year}-W${String(week).padStart(2, "0")}`;
}
function compareGraphEpisodeRecency(left, right) {
    const occurred = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    if (occurred !== 0)
        return occurred;
    const observed = Date.parse(right.observedAt) - Date.parse(left.observedAt);
    if (observed !== 0)
        return observed;
    return compareCodePoint(left.episodeId, right.episodeId);
}
function graphFeedPayload(value) {
    return value;
}
/**
 * Builds the community-brain-only history feed. It never enters the bounded
 * native semantic admission path above/below this function.
 */
function buildTaskMapAgentSessionGraphFeed(input) {
    const candidates = (0, agent_session_producer_freshness_js_1.selectTaskMapAgentSessionGraphEpisodeCandidates)(input);
    return buildTaskMapAgentSessionGraphFeedFromSelection(candidates);
}
/**
 * Reuses the authenticated bounded producer snapshot for review-only grouping.
 * It performs no wider session scan and grants no accepted membership.
 */
function buildTaskMapAgentSessionGraphFeedFromSnapshot(snapshot) {
    (0, agent_session_producer_freshness_js_1.assertTaskMapAgentSessionProducerSnapshot)(snapshot);
    const recurrenceEpisodes = snapshot.sessions.filter((episode) => episode.disposition === "work_candidate");
    return buildTaskMapAgentSessionGraphFeedFromSelection({
        ownerScopeDigest: snapshot.ownerScopeDigest,
        producedAt: snapshot.producedAt,
        observedCount: snapshot.observedCount,
        recurrenceEpisodes,
        episodes: recurrenceEpisodes,
    });
}
function buildTaskMapAgentSessionGraphFeedFromSelection(candidates) {
    const routed = candidates.episodes
        .map((episode) => routeEpisode(candidates.ownerScopeDigest, episode))
        .filter((row) => row !== null);
    const recurrenceRouted = candidates.recurrenceEpisodes
        .map((episode) => routeEpisode(candidates.ownerScopeDigest, episode))
        .filter((row) => row !== null);
    const recurrenceByDirective = new Map();
    for (const row of recurrenceRouted) {
        const recurrenceKey = [
            row.workstreamIdentityDigest,
            row.episode.directiveSemanticDigest,
        ].join(":");
        const recurrence = recurrenceByDirective.get(recurrenceKey);
        recurrenceByDirective.set(recurrenceKey, {
            count: (recurrence?.count ?? 0) + 1,
            firstSeenAt: recurrence === undefined
                || compareCodePoint(row.episode.occurredAt, recurrence.firstSeenAt) < 0
                ? row.episode.occurredAt
                : recurrence.firstSeenAt,
        });
    }
    const grouped = new Map();
    for (const row of routed) {
        const week = taskMapAgentSessionIsoWeek(row.episode.occurredAt);
        const key = [
            row.workstreamIdentityDigest,
            week,
            row.episode.provider,
            row.episode.directiveSemanticDigest,
        ].join(":");
        const members = grouped.get(key) ?? [];
        members.push(row);
        grouped.set(key, members);
    }
    const summaries = [];
    for (const members of grouped.values()) {
        members.sort((left, right) => compareGraphEpisodeRecency(left.episode, right.episode));
        const representative = members[0];
        const recurrence = recurrenceByDirective.get([
            representative.workstreamIdentityDigest,
            representative.episode.directiveSemanticDigest,
        ].join(":"));
        const week = taskMapAgentSessionIsoWeek(representative.episode.occurredAt);
        const base = {
            ...representative.episode,
            workstreamIdentityDigest: representative.workstreamIdentityDigest,
            routingKind: representative.routingKind,
            providerNeutralRoutingDigest: representative.providerNeutralRoutingDigest,
            isoWeek: week,
            recurrenceCount: recurrence.count,
            firstSeenAt: recurrence.firstSeenAt,
        };
        const graphEpisodeDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: exports.TASKMAP_AGENT_SESSION_GRAPH_EPISODE_IDENTITY_DOMAIN,
            ownerScopeDigest: candidates.ownerScopeDigest,
            workstreamIdentityDigest: representative.workstreamIdentityDigest,
            isoWeek: week,
            provider: representative.episode.provider,
            directiveSemanticDigest: representative.episode.directiveSemanticDigest,
        });
        const graphEpisodeRevisionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: exports.TASKMAP_AGENT_SESSION_GRAPH_EPISODE_REVISION_DOMAIN,
            graphEpisodeDigest,
            representativeEpisodeRevisionDigest: representative.episode.episodeRevisionDigest,
            recurrenceCount: recurrence.count,
            firstSeenAt: recurrence.firstSeenAt,
        });
        summaries.push({
            ...base,
            graphEpisodeId: stableId("tmagraph", graphEpisodeDigest),
            graphEpisodeDigest,
            graphEpisodeRevisionDigest,
        });
    }
    const byBucket = new Map();
    for (const episode of summaries) {
        const key = `${episode.workstreamIdentityDigest}:${episode.isoWeek}`;
        const bucket = byBucket.get(key) ?? {
            workstreamIdentityDigest: episode.workstreamIdentityDigest,
            isoWeek: episode.isoWeek,
            episodes: [],
        };
        bucket.episodes.push(episode);
        byBucket.set(key, bucket);
    }
    const canonicalBuckets = [...byBucket.values()].sort((left, right) => {
        const workstream = compareCodePoint(left.workstreamIdentityDigest, right.workstreamIdentityDigest);
        return workstream !== 0
            ? workstream
            : compareCodePoint(left.isoWeek, right.isoWeek);
    });
    const buckets = canonicalBuckets.map((bucket, bucketIndex) => {
        const byProvider = new Map();
        for (const episode of bucket.episodes) {
            const providerEpisodes = byProvider.get(episode.provider) ?? [];
            providerEpisodes.push(episode);
            byProvider.set(episode.provider, providerEpisodes);
        }
        const providerQueues = [...byProvider.entries()]
            .map(([provider, episodes]) => ({
            provider,
            episodes: episodes.sort((left, right) => {
                const recency = compareGraphEpisodeRecency(left, right);
                return recency !== 0
                    ? recency
                    : compareCodePoint(left.graphEpisodeId, right.graphEpisodeId);
            }),
        }))
            .sort((left, right) => compareCodePoint(left.provider, right.provider));
        const fairEpisodes = [];
        for (let round = 0;; round += 1) {
            let added = false;
            for (let step = 0; step < providerQueues.length; step += 1) {
                const queue = providerQueues[(bucketIndex + round + step) % providerQueues.length];
                const episode = queue.episodes[round];
                if (episode === undefined)
                    continue;
                fairEpisodes.push(episode);
                added = true;
            }
            if (!added)
                break;
        }
        return { ...bucket, episodes: fairEpisodes };
    });
    const bucketsByWorkstream = new Map();
    for (const bucket of buckets) {
        const workstreamBuckets = bucketsByWorkstream.get(bucket.workstreamIdentityDigest) ?? [];
        workstreamBuckets.push(bucket);
        bucketsByWorkstream.set(bucket.workstreamIdentityDigest, workstreamBuckets);
    }
    const workstreamQueues = [...bucketsByWorkstream.entries()]
        .map(([workstreamIdentityDigest, weekBuckets]) => ({
        workstreamIdentityDigest,
        weekBuckets: weekBuckets.sort((left, right) => compareCodePoint(right.isoWeek, left.isoWeek)),
    }))
        .sort((left, right) => compareCodePoint(left.workstreamIdentityDigest, right.workstreamIdentityDigest));
    const selected = [];
    selection: for (let episodeRound = 0;; episodeRound += 1) {
        let episodeRoundAdded = false;
        for (let weekRound = 0;; weekRound += 1) {
            let weekRoundAdded = false;
            for (const workstream of workstreamQueues) {
                const episode = workstream.weekBuckets[weekRound]
                    ?.episodes[episodeRound];
                if (episode === undefined)
                    continue;
                selected.push(episode);
                episodeRoundAdded = true;
                weekRoundAdded = true;
                if (selected.length === agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEpisodesGlobal)
                    break selection;
            }
            if (!weekRoundAdded)
                break;
        }
        if (!episodeRoundAdded)
            break;
    }
    const episodes = selected.sort((left, right) => compareCodePoint(left.graphEpisodeId, right.graphEpisodeId));
    const base = graphFeedPayload({
        contractVersion: exports.TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION,
        ownerScopeDigest: candidates.ownerScopeDigest,
        producedAt: candidates.producedAt,
        authority: "none",
        acceptedMembershipAuthority: false,
        limits: agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1,
        counts: {
            inputObservations: candidates.observedCount,
            eligibleEpisodes: recurrenceRouted.length,
            deduplicatedEpisodes: summaries.length,
            selectedEpisodes: episodes.length,
        },
        episodes,
    });
    const feedDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    return deepFreeze({
        ...base,
        feedId: stableId("tmagraphfeed", feedDigest),
        feedDigest,
    });
}
function supportFromEpisode(episode) {
    return {
        supportIdentityDigest: episode.turnLineageIdentityDigest,
        turnLineageIdentityDigest: episode.turnLineageIdentityDigest,
        episodeId: episode.episodeId,
        episodeIdentityDigest: episode.episodeIdentityDigest,
        rootSessionIdentityDigest: episode.rootSessionIdentityDigest,
        provider: episode.provider,
        occurredAt: episode.occurredAt,
        observedAt: episode.observedAt,
    };
}
function compareClusterRecency(left, right) {
    const occurred = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    if (occurred !== 0)
        return occurred;
    const observed = Date.parse(right.observedAt) - Date.parse(left.observedAt);
    if (observed !== 0)
        return observed;
    return left.clusterIdentityDigest.localeCompare(right.clusterIdentityDigest);
}
function admissionPayload(value) {
    return value;
}
function buildTaskMapAgentSessionSemanticAdmission(snapshot) {
    (0, agent_session_producer_freshness_js_1.assertTaskMapAgentSessionProducerSnapshot)(snapshot);
    const latest = (0, agent_session_producer_freshness_js_1.selectLatestTaskMapAgentSessionWorkEpisodesByRoot)(snapshot.sessions);
    const dispositionCount = new Map(DISPOSITIONS.map((disposition) => [disposition, 0]));
    for (const episode of latest) {
        dispositionCount.set(episode.disposition, (dispositionCount.get(episode.disposition) ?? 0) + 1);
    }
    const work = latest.filter((episode) => episode.disposition === "work_candidate");
    const routed = [];
    let unrouted = 0;
    for (const episode of work) {
        const route = routeEpisode(snapshot.ownerScopeDigest, episode);
        if (route === null) {
            unrouted += 1;
        }
        else {
            routed.push(route);
        }
    }
    const byLineage = new Map();
    let duplicateLineage = 0;
    for (const row of routed.sort((left, right) => compareEpisodeRecency(left.episode, right.episode))) {
        if (byLineage.has(row.episode.turnLineageIdentityDigest)) {
            duplicateLineage += 1;
            continue;
        }
        byLineage.set(row.episode.turnLineageIdentityDigest, row);
    }
    const grouped = new Map();
    for (const row of byLineage.values()) {
        const key = `${row.workstreamIdentityDigest}:${row.episode.directiveSemanticDigest}`;
        const members = grouped.get(key) ?? [];
        members.push(row);
        grouped.set(key, members);
    }
    let supportOverflow = 0;
    const unboundedClusters = [];
    for (const members of grouped.values()) {
        members.sort((left, right) => compareEpisodeRecency(left.episode, right.episode));
        const representative = members[0];
        const supports = members
            .map((member) => supportFromEpisode(member.episode))
            .sort((left, right) => left.supportIdentityDigest.localeCompare(right.supportIdentityDigest));
        supportOverflow += Math.max(0, supports.length
            - exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
                .maxSupportKeysPerCluster);
        const boundedSupports = supports.slice(0, exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
            .maxSupportKeysPerCluster);
        const clusterIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: exports.TASKMAP_AGENT_SESSION_PROPOSAL_CLUSTER_IDENTITY_DOMAIN,
            ownerScopeDigest: snapshot.ownerScopeDigest,
            workstreamIdentityDigest: representative.workstreamIdentityDigest,
            directiveSemanticDigest: representative.episode.directiveSemanticDigest,
        });
        unboundedClusters.push({
            clusterId: stableId("tmaproposal", clusterIdentityDigest),
            clusterIdentityDigest,
            proposalClusterDigest: clusterIdentityDigest,
            workstreamIdentityDigest: representative.workstreamIdentityDigest,
            routingKind: representative.routingKind,
            providerNeutralRoutingDigest: representative.providerNeutralRoutingDigest,
            directiveSemanticDigest: representative.episode.directiveSemanticDigest,
            recordKind: "review_only_agent_proposal",
            proposalDisposition: "candidate_or_context_only",
            authority: "none",
            acceptedMembershipAuthority: false,
            lifecycleAuthority: false,
            completionAuthority: false,
            verificationAuthority: false,
            userDirectiveSummary: representative.episode.userDirectiveSummary,
            assistantOutcomeSummary: representative.episode.assistantOutcomeSummary,
            occurredAt: representative.episode.occurredAt,
            observedAt: representative.episode.observedAt,
            supports: boundedSupports,
        });
    }
    const byWorkstream = new Map();
    for (const cluster of unboundedClusters) {
        const clusters = byWorkstream.get(cluster.workstreamIdentityDigest) ?? [];
        clusters.push(cluster);
        byWorkstream.set(cluster.workstreamIdentityDigest, clusters);
    }
    let clusterOverflow = 0;
    const workstreamQueues = [...byWorkstream.entries()].map(([workstreamIdentityDigest, clusters]) => {
        clusters.sort(compareClusterRecency);
        clusterOverflow += Math.max(0, clusters.length
            - exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
                .maxClustersPerWorkstream);
        return {
            workstreamIdentityDigest,
            clusters: clusters.slice(0, exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
                .maxClustersPerWorkstream),
        };
    }).sort((left, right) => {
        const recency = compareClusterRecency(left.clusters[0], right.clusters[0]);
        return recency !== 0
            ? recency
            : left.workstreamIdentityDigest.localeCompare(right.workstreamIdentityDigest);
    });
    const selected = [];
    for (let round = 0; selected.length
        < exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2.maxClustersGlobal; round += 1) {
        let added = false;
        for (const queue of workstreamQueues) {
            const cluster = queue.clusters[round];
            if (cluster === undefined)
                continue;
            selected.push(cluster);
            added = true;
            if (selected.length
                === exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
                    .maxClustersGlobal)
                break;
        }
        if (!added)
            break;
    }
    const perWorkstreamRetained = workstreamQueues.reduce((sum, queue) => sum + queue.clusters.length, 0);
    clusterOverflow += perWorkstreamRetained - selected.length;
    const clusters = selected.sort((left, right) => {
        const workstream = left.workstreamIdentityDigest.localeCompare(right.workstreamIdentityDigest);
        return workstream !== 0
            ? workstream
            : left.clusterIdentityDigest.localeCompare(right.clusterIdentityDigest);
    });
    const dispositionCounts = DISPOSITIONS.map((disposition) => ({
        disposition,
        count: dispositionCount.get(disposition) ?? 0,
    }));
    const base = admissionPayload({
        contractVersion: exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_VERSION,
        producerVersion: agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_VERSION,
        sourceSnapshotContractVersion: agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION,
        sourceSnapshotDigest: snapshot.snapshotDigest,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        producedAt: snapshot.producedAt,
        authority: "none",
        acceptedMembershipAuthority: false,
        limits: exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2,
        counts: {
            inputTurns: snapshot.sessions.length,
            latestTurns: latest.length,
            suppressedNonWork: latest.length - work.length,
            unrouted,
            duplicateLineage,
            clusterOverflow,
            supportOverflow,
        },
        dispositionCounts,
        clusters,
    });
    const admissionDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    const admission = {
        ...base,
        admissionId: stableId("tmaadmission", admissionDigest),
        admissionDigest,
    };
    assertTaskMapAgentSessionSemanticAdmission(admission);
    return deepFreeze(admission);
}
function assertSupport(value, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, [
        "episodeId",
        "episodeIdentityDigest",
        "observedAt",
        "occurredAt",
        "provider",
        "rootSessionIdentityDigest",
        "supportIdentityDigest",
        "turnLineageIdentityDigest",
    ], label);
    assertDigest(value.supportIdentityDigest, `${label}.supportIdentityDigest`);
    assertDigest(value.turnLineageIdentityDigest, `${label}.turnLineageIdentityDigest`);
    if (value.supportIdentityDigest !== value.turnLineageIdentityDigest) {
        throw new Error(`${label} support identity is inconsistent`);
    }
    if (typeof value.episodeId !== "string" || !STABLE_ID.test(value.episodeId)) {
        throw new Error(`${label}.episodeId is invalid`);
    }
    assertDigest(value.episodeIdentityDigest, `${label}.episodeIdentityDigest`);
    assertDigest(value.rootSessionIdentityDigest, `${label}.rootSessionIdentityDigest`);
    if (value.provider !== "codex" && value.provider !== "claude") {
        throw new Error(`${label}.provider is invalid`);
    }
    assertTimestamp(value.occurredAt, `${label}.occurredAt`);
    assertTimestamp(value.observedAt, `${label}.observedAt`);
    if (Date.parse(value.occurredAt) > Date.parse(value.observedAt)) {
        throw new Error(`${label} timestamps are inconsistent`);
    }
}
function assertCluster(value, ownerScopeDigest, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, [
        "acceptedMembershipAuthority",
        "assistantOutcomeSummary",
        "authority",
        "clusterId",
        "clusterIdentityDigest",
        "completionAuthority",
        "directiveSemanticDigest",
        "lifecycleAuthority",
        "observedAt",
        "occurredAt",
        "proposalClusterDigest",
        "proposalDisposition",
        "providerNeutralRoutingDigest",
        "recordKind",
        "routingKind",
        "supports",
        "userDirectiveSummary",
        "verificationAuthority",
        "workstreamIdentityDigest",
    ], label);
    assertDigest(value.clusterIdentityDigest, `${label}.clusterIdentityDigest`);
    assertDigest(value.proposalClusterDigest, `${label}.proposalClusterDigest`);
    assertDigest(value.workstreamIdentityDigest, `${label}.workstreamIdentityDigest`);
    assertDigest(value.providerNeutralRoutingDigest, `${label}.providerNeutralRoutingDigest`);
    assertDigest(value.directiveSemanticDigest, `${label}.directiveSemanticDigest`);
    if (typeof value.clusterId !== "string"
        || value.clusterId !== stableId("tmaproposal", value.clusterIdentityDigest)
        || value.proposalClusterDigest !== value.clusterIdentityDigest) {
        throw new Error(`${label} cluster identity is inconsistent`);
    }
    if (value.routingKind !== "project" && value.routingKind !== "repository") {
        throw new Error(`${label}.routingKind is invalid`);
    }
    const expectedWorkstream = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_AGENT_SESSION_WORKSTREAM_IDENTITY_DOMAIN,
        ownerScopeDigest,
        routingKind: value.routingKind,
        providerNeutralRoutingDigest: value.providerNeutralRoutingDigest,
    });
    const expectedCluster = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_AGENT_SESSION_PROPOSAL_CLUSTER_IDENTITY_DOMAIN,
        ownerScopeDigest,
        workstreamIdentityDigest: value.workstreamIdentityDigest,
        directiveSemanticDigest: value.directiveSemanticDigest,
    });
    if (value.workstreamIdentityDigest !== expectedWorkstream
        || value.clusterIdentityDigest !== expectedCluster) {
        throw new Error(`${label} derived identity is inconsistent`);
    }
    if (value.recordKind !== "review_only_agent_proposal"
        || value.proposalDisposition !== "candidate_or_context_only"
        || value.authority !== "none"
        || value.acceptedMembershipAuthority !== false
        || value.lifecycleAuthority !== false
        || value.completionAuthority !== false
        || value.verificationAuthority !== false) {
        throw new Error(`${label} exceeds review-only authority`);
    }
    assertSafeSummary(value.userDirectiveSummary, 360, `${label}.userDirectiveSummary`);
    assertSafeSummary(value.assistantOutcomeSummary, 480, `${label}.assistantOutcomeSummary`, true);
    assertTimestamp(value.occurredAt, `${label}.occurredAt`);
    assertTimestamp(value.observedAt, `${label}.observedAt`);
    if (Date.parse(value.occurredAt) > Date.parse(value.observedAt)) {
        throw new Error(`${label} timestamps are inconsistent`);
    }
    if (!Array.isArray(value.supports)
        || value.supports.length === 0
        || value.supports.length
            > exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
                .maxSupportKeysPerCluster) {
        throw new Error(`${label}.supports exceed their bounds`);
    }
    value.supports.forEach((support, index) => assertSupport(support, `${label}.supports[${index}]`));
    const canonicalSupports = [...value.supports].sort((left, right) => left.supportIdentityDigest.localeCompare(right.supportIdentityDigest));
    if (new Set(value.supports.map((support) => support.supportIdentityDigest)).size
        !== value.supports.length
        || value.supports.some((support, index) => support !== canonicalSupports[index])) {
        throw new Error(`${label}.supports are not canonical`);
    }
}
function assertTaskMapAgentSessionSemanticAdmission(value) {
    assertPlainObject(value, "agent session semantic admission");
    assertClosedKeys(value, [
        "acceptedMembershipAuthority",
        "admissionDigest",
        "admissionId",
        "authority",
        "clusters",
        "contractVersion",
        "counts",
        "dispositionCounts",
        "limits",
        "ownerScopeDigest",
        "producedAt",
        "producerVersion",
        "sourceSnapshotContractVersion",
        "sourceSnapshotDigest",
    ], "agent session semantic admission");
    if (value.contractVersion !== exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_VERSION
        || value.producerVersion !== agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_VERSION
        || value.sourceSnapshotContractVersion
            !== agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION) {
        throw new Error("agent admission has a mixed or unsupported generation");
    }
    if (value.authority !== "none" || value.acceptedMembershipAuthority !== false) {
        throw new Error("agent admission exceeds review-only authority");
    }
    if (typeof value.admissionId !== "string" || !STABLE_ID.test(value.admissionId)) {
        throw new Error("admissionId is invalid");
    }
    assertDigest(value.admissionDigest, "admissionDigest");
    assertDigest(value.sourceSnapshotDigest, "sourceSnapshotDigest");
    assertDigest(value.ownerScopeDigest, "ownerScopeDigest");
    const ownerScopeDigest = value.ownerScopeDigest;
    assertTimestamp(value.producedAt, "producedAt");
    assertPlainObject(value.limits, "limits");
    assertClosedKeys(value.limits, [
        "maxClustersGlobal",
        "maxClustersPerWorkstream",
        "maxSupportKeysPerCluster",
    ], "limits");
    if (value.limits.maxClustersGlobal
        !== exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2.maxClustersGlobal
        || value.limits.maxClustersPerWorkstream
            !== exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
                .maxClustersPerWorkstream
        || value.limits.maxSupportKeysPerCluster
            !== exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
                .maxSupportKeysPerCluster) {
        throw new Error("admission limits are invalid");
    }
    assertPlainObject(value.counts, "counts");
    assertClosedKeys(value.counts, [
        "clusterOverflow",
        "duplicateLineage",
        "inputTurns",
        "latestTurns",
        "supportOverflow",
        "suppressedNonWork",
        "unrouted",
    ], "counts");
    for (const [key, count] of Object.entries(value.counts)) {
        assertCount(count, `counts.${key}`);
    }
    if (!Array.isArray(value.dispositionCounts)) {
        throw new Error("dispositionCounts must be an array");
    }
    if (value.dispositionCounts.length !== DISPOSITIONS.length
        || value.dispositionCounts.some((row, index) => {
            if (!isPlainObject(row))
                return true;
            try {
                assertClosedKeys(row, ["count", "disposition"], `dispositionCounts[${index}]`);
                assertCount(row.count, `dispositionCounts[${index}].count`);
            }
            catch {
                return true;
            }
            return row.disposition !== DISPOSITIONS[index];
        })) {
        throw new Error("disposition counts are not canonical");
    }
    const counts = value.counts;
    const canonicalDispositionCounts = value.dispositionCounts;
    const dispositionTotal = canonicalDispositionCounts.reduce((sum, row) => sum + row.count, 0);
    const workCount = canonicalDispositionCounts.find((row) => row.disposition === "work_candidate")?.count ?? 0;
    const nonWorkCount = dispositionTotal - workCount;
    const routedLineages = workCount - counts.unrouted;
    const uniqueAdmittedLineages = routedLineages - counts.duplicateLineage;
    if (dispositionTotal !== counts.latestTurns
        || counts.latestTurns > counts.inputTurns
        || counts.suppressedNonWork !== nonWorkCount
        || routedLineages < 0
        || uniqueAdmittedLineages < 0) {
        throw new Error("admission accounting is inconsistent");
    }
    if (!Array.isArray(value.clusters)
        || value.clusters.length
            > exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2.maxClustersGlobal) {
        throw new Error("clusters exceed their bounds");
    }
    value.clusters.forEach((cluster, index) => assertCluster(cluster, ownerScopeDigest, `clusters[${index}]`));
    const visibleSupportCount = value.clusters.reduce((sum, cluster) => sum + cluster.supports.length, 0);
    const representedClusterCount = value.clusters.length + counts.clusterOverflow;
    const hiddenRetained = uniqueAdmittedLineages - visibleSupportCount - counts.supportOverflow;
    const maximumHiddenRetained = counts.clusterOverflow
        * exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2.maxSupportKeysPerCluster;
    if (counts.supportOverflow > uniqueAdmittedLineages
        || hiddenRetained < counts.clusterOverflow
        || hiddenRetained > maximumHiddenRetained
        || representedClusterCount > uniqueAdmittedLineages
        || (uniqueAdmittedLineages > 0 && representedClusterCount === 0)
        || (uniqueAdmittedLineages === 0
            && (representedClusterCount !== 0 || counts.supportOverflow !== 0))) {
        throw new Error("admission accounting is inconsistent");
    }
    const canonicalClusters = [...value.clusters].sort((left, right) => {
        const workstream = left.workstreamIdentityDigest.localeCompare(right.workstreamIdentityDigest);
        return workstream !== 0
            ? workstream
            : left.clusterIdentityDigest.localeCompare(right.clusterIdentityDigest);
    });
    const workstreamCounts = new Map();
    if (new Set(value.clusters.map((cluster) => cluster.clusterIdentityDigest)).size
        !== value.clusters.length
        || value.clusters.some((cluster, index) => cluster !== canonicalClusters[index])) {
        throw new Error("clusters are not canonical");
    }
    for (const cluster of value.clusters) {
        workstreamCounts.set(cluster.workstreamIdentityDigest, (workstreamCounts.get(cluster.workstreamIdentityDigest) ?? 0) + 1);
    }
    if ([...workstreamCounts.values()].some((count) => count
        > exports.TASKMAP_AGENT_SESSION_SEMANTIC_ADMISSION_LIMITS_V2
            .maxClustersPerWorkstream)) {
        throw new Error("workstream cluster count exceeds its bound");
    }
    const { admissionId, admissionDigest, ...base } = value;
    if (admissionDigest !== (0, source_contracts_js_1.taskMapContractDigest)(base)
        || admissionId !== stableId("tmaadmission", admissionDigest)) {
        throw new Error("admission identity or digest is inconsistent");
    }
}
