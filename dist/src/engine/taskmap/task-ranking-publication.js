"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_TASK_RANKING_MAX_BYTES = exports.TASKMAP_TASK_RANKING_FILENAME = exports.TASKMAP_TASK_RANKING_PUBLICATION_VERSION = void 0;
exports.buildTaskMapTaskRankingPublication = buildTaskMapTaskRankingPublication;
exports.validateTaskMapTaskRankingPublication = validateTaskMapTaskRankingPublication;
const node_crypto_1 = require("node:crypto");
const owner_refresh_coordinator_js_1 = require("./owner-refresh-coordinator.js");
const source_contracts_js_1 = require("./source-contracts.js");
const work_control_decision_js_1 = require("./work-control-decision.js");
exports.TASKMAP_TASK_RANKING_PUBLICATION_VERSION = "taskmap-task-ranking.v1";
exports.TASKMAP_TASK_RANKING_FILENAME = "taskmap-task-ranking.v1.json";
exports.TASKMAP_TASK_RANKING_MAX_BYTES = 2 * 1_024 * 1_024;
const SHA256 = /^[a-f0-9]{64}$/;
const FORBIDDEN_MARKER_FINGERPRINTS = Object.freeze([
    { length: 19, sha256: "2a6ab24aadadb5db8f101113dfcbaec170bc8d69b9f9c8b0ee6c3a74004d2f5c" },
    { length: 26, sha256: "c6f395f80225412ddbcc7880ab8123e869a9f8a47053d2c4afbe08c6779738e3" },
    { length: 24, sha256: "77099b4f3710a4f1ee29e1666adb7e35b576af29053684a703d43f6d276f21a7" },
    { length: 15, sha256: "3361a7530704f4841ac63a9b096ec30c0e6fbb21f3ccc7be835f90e03fbbb82b" },
    { length: 12, sha256: "d13f204287564e8acf012bb205be49458fd035536e2d2aed627cddb4df8fd81c" },
]);
const SOURCE_FAMILY_BY_KIND = Object.freeze({
    codex_session: "agent_session",
    claude_session: "agent_session",
    cursor_session: "agent_session",
    gemini_meet: "meeting_notes",
    granola: "meeting_notes",
    google_calendar: "calendar",
    local_calendar: "calendar",
    oura: "body",
});
function fail(message) {
    throw new Error(`Task Map task ranking invalid: ${message}`);
}
function isPlainObject(value) {
    return value !== null
        && typeof value === "object"
        && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
function assertExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        fail(`${label} keys`);
    }
}
function stringHasForbiddenMarker(value) {
    const normalized = value.toLowerCase();
    for (const fingerprint of FORBIDDEN_MARKER_FINGERPRINTS) {
        if (normalized.length < fingerprint.length)
            continue;
        for (let start = 0; start <= normalized.length - fingerprint.length; start += 1) {
            const candidate = normalized.slice(start, start + fingerprint.length);
            const sha256 = (0, node_crypto_1.createHash)("sha256").update(candidate).digest("hex");
            if (sha256 === fingerprint.sha256)
                return true;
        }
    }
    return false;
}
function assertNoForbiddenMarkers(value) {
    const pending = [value];
    while (pending.length > 0) {
        const next = pending.pop();
        if (typeof next === "string") {
            if (stringHasForbiddenMarker(next))
                fail("demo marker");
        }
        else if (Array.isArray(next)) {
            pending.push(...next);
        }
        else if (isPlainObject(next)) {
            for (const [key, child] of Object.entries(next)) {
                if (stringHasForbiddenMarker(key))
                    fail("demo marker");
                pending.push(child);
            }
        }
    }
}
function projectionDigest(projection) {
    return (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
}
function normalizeCoverage(statuses) {
    const statusBySource = new Map();
    for (const status of statuses) {
        if (statusBySource.has(status.source))
            fail("duplicate coverage source");
        statusBySource.set(status.source, status);
    }
    if (statusBySource.size !== owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.length) {
        fail("coverage must contain all source families");
    }
    return owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => {
        const status = statusBySource.get(source);
        if (status === undefined)
            fail("missing coverage source");
        if (status.disposition === "fresh") {
            if (status.sliceDigest === null || !SHA256.test(status.sliceDigest)) {
                fail("current coverage digest");
            }
            return { source, state: "current", sliceDigest: status.sliceDigest };
        }
        // Retained last-good is deliberately unavailable to this publication. It
        // must never silently become current content or a ranking citation.
        return { source, state: "unavailable", sliceDigest: null };
    });
}
function assertCitationsCovered(rows, coverage, projection) {
    const current = new Set(coverage.filter((row) => row.state === "current").map((row) => row.source));
    for (const row of rows) {
        if (row.citations.length === 0) {
            fail("ranked task citation is required");
        }
        for (const citation of row.citations) {
            const family = SOURCE_FAMILY_BY_KIND[citation.sourceKind];
            if (family !== undefined
                && current.has(family))
                continue;
            const task = projection.tasks.find((candidate) => candidate.id === row.taskId);
            const source = projection.sources.find((candidate) => candidate.id === citation.pointerId);
            const pointerMatch = /^tmcandidatepromotion_([a-f0-9]{64})$/.exec(citation.pointerId);
            const promotionDigest = pointerMatch?.[1];
            const exactManualReceipt = promotionDigest !== undefined
                && citation.sourceKind === "manual"
                && citation.eventId
                    === `tmcandidatepromotionevent_${promotionDigest}`
                && citation.sourceRefHash === promotionDigest
                && task?.reviewState === "accepted"
                && task.authority === "user"
                && task.taskHomePointerId === citation.pointerId
                && task.originPointerIds.includes(citation.pointerId)
                && source?.sourceKind === "manual"
                && source.sourceVersion === promotionDigest
                && source.authority === "user"
                && source.syncMode === "personal_fork"
                && source.canonicalUrl === undefined
                && source.capabilities.length === 1
                && source.capabilities[0] === "read_task";
            if (!exactManualReceipt) {
                fail("citation from unavailable source family");
            }
        }
    }
}
function coreFor(projection, ownerScopeDigest, coverage) {
    if (projection.runStatus !== "accepted" || projection.rejections.length !== 0) {
        fail("projection is not accepted");
    }
    if (!SHA256.test(ownerScopeDigest))
        fail("owner scope digest");
    const taskById = new Map(projection.tasks.map((task) => [task.id, task]));
    const rankedAcceptedOpen = (0, work_control_decision_js_1.rankAcceptedOpenProjectionTasks)(projection)
        .map((rank) => {
        const task = taskById.get(rank.taskId);
        if (task === undefined)
            fail("rank task missing from projection");
        return { ...rank, citations: structuredClone(task.citations) };
    });
    assertCitationsCovered(rankedAcceptedOpen, coverage, projection);
    return {
        contractVersion: exports.TASKMAP_TASK_RANKING_PUBLICATION_VERSION,
        ownerScopeDigest,
        projection: {
            contractVersion: projection.contractVersion,
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            projectionDigest: projectionDigest(projection),
        },
        policy: {
            version: work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_VERSION,
            digest: work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_DIGEST,
        },
        coverage,
        rankedAcceptedOpen,
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawOwnerIdentifiersStored: false,
            rawSourceObjectIdentifiersStored: false,
            rawBiometricsStored: false,
            connectorSecretsStored: false,
        },
    };
}
function buildTaskMapTaskRankingPublication(input) {
    const core = coreFor(input.projection, input.ownerScopeDigest, normalizeCoverage(input.sourceStatuses));
    assertNoForbiddenMarkers(core);
    const result = { ...core, artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core) };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(result), "utf8")
        > exports.TASKMAP_TASK_RANKING_MAX_BYTES) {
        fail("artifact size bound");
    }
    return result;
}
function validateTaskMapTaskRankingPublication(value, projection, expectedOwnerScopeDigest) {
    if (!isPlainObject(value))
        fail("document shape");
    assertExactKeys(value, [
        "contractVersion",
        "artifactDigest",
        "ownerScopeDigest",
        "projection",
        "policy",
        "coverage",
        "rankedAcceptedOpen",
        "privacy",
    ], "document");
    if (value.contractVersion !== exports.TASKMAP_TASK_RANKING_PUBLICATION_VERSION
        || typeof value.artifactDigest !== "string"
        || !SHA256.test(value.artifactDigest)
        || typeof value.ownerScopeDigest !== "string"
        || !SHA256.test(value.ownerScopeDigest)
        || value.ownerScopeDigest !== expectedOwnerScopeDigest
        || !Array.isArray(value.coverage)) {
        fail("document binding");
    }
    const statuses = value.coverage.map((item) => {
        if (!isPlainObject(item))
            fail("coverage row shape");
        assertExactKeys(item, ["source", "state", "sliceDigest"], "coverage row");
        if (!owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.includes(item.source))
            fail("coverage source");
        if (item.state === "current") {
            if (typeof item.sliceDigest !== "string" || !SHA256.test(item.sliceDigest)) {
                fail("coverage current digest");
            }
            return {
                source: item.source,
                disposition: "fresh",
                sliceDigest: item.sliceDigest,
            };
        }
        if (item.state !== "unavailable" || item.sliceDigest !== null) {
            fail("coverage unavailable state");
        }
        return {
            source: item.source,
            disposition: "unavailable",
            sliceDigest: null,
        };
    });
    const expectedCore = coreFor(projection, value.ownerScopeDigest, normalizeCoverage(statuses));
    const expected = {
        ...expectedCore,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(expectedCore),
    };
    assertNoForbiddenMarkers(value);
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(value) !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(expected)) {
        fail("canonical projection/rank mismatch");
    }
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(expected), "utf8")
        > exports.TASKMAP_TASK_RANKING_MAX_BYTES) {
        fail("artifact size bound");
    }
    return structuredClone(expected);
}
