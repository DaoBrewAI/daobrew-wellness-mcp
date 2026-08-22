"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THREAD_KEY_VERSION = void 0;
exports.sha24 = sha24;
exports.deriveThreadKey = deriveThreadKey;
exports.threadId = threadId;
exports.snapshotId = snapshotId;
exports.evidenceId = evidenceId;
exports.verificationId = verificationId;
exports.contributorHash = contributorHash;
exports.transferRecordId = transferRecordId;
const node_crypto_1 = require("node:crypto");
exports.THREAD_KEY_VERSION = 1;
function sha24(basis) {
    return (0, node_crypto_1.createHash)("sha256").update(basis).digest("hex").slice(0, 24);
}
function normalizeTerms(values) {
    const seen = new Set();
    for (const value of values ?? []) {
        const term = value.trim().toLowerCase().replace(/^#+/, "");
        if (term)
            seen.add(term);
    }
    return [...seen].sort();
}
function deriveThreadKey(input) {
    if (input.graphRootId)
        return `root:${input.graphRootId}`;
    const basis = [
        input.sourceKind ?? "",
        normalizeTerms(input.topics).join(","),
        normalizeTerms(input.patternKeys).join(","),
    ].join("|");
    return `sem:v${exports.THREAD_KEY_VERSION}:${sha24(basis)}`;
}
function threadId(userId, threadKey) {
    return `cmt_${sha24(`${userId}|${threadKey}`)}`;
}
function snapshotId(userId, version) {
    return `ums_${sha24(`${userId}|${version}`)}`;
}
function evidenceId(input) {
    const basis = [
        input.threadId,
        input.sourceTable ?? "",
        input.sourceId ?? "",
        input.graphNodeId ?? "",
        input.graphEdgeId ?? "",
        input.evidenceRole,
    ].join("|");
    return `cte_${sha24(basis)}`;
}
function verificationId(input) {
    return `tvf_${sha24([input.threadId, input.kind, input.bucket].join("|"))}`;
}
/** Salted HMAC of the user id (5B): lets opt-out purge find a contributor's
 *  transfer_records without any stored identity. The salt is server custody
 *  (DAOBREW_TRANSFER_SALT) — callers fail closed when it is absent. */
function contributorHash(userId, salt) {
    return (0, node_crypto_1.createHmac)("sha256", salt).update(userId).digest("hex").slice(0, 24);
}
function transferRecordId(input) {
    return `trf_${sha24([input.contributorHash, input.threadKey, String(input.handledAtTs)].join("|"))}`;
}
