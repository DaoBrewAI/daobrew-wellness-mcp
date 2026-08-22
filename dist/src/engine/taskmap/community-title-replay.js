"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_COMMUNITY_TITLE_ENVELOPE_MAX_BYTES = void 0;
exports.loadRecordedCommunityTitleEnvelope = loadRecordedCommunityTitleEnvelope;
exports.withCommunityTitleEnvelopeRecording = withCommunityTitleEnvelopeRecording;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const community_root_proposals_js_1 = require("./community-root-proposals.js");
const meeting_refresh_llm_replay_js_1 = require("./meeting-refresh-llm-replay.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
exports.TASKMAP_COMMUNITY_TITLE_ENVELOPE_MAX_BYTES = 256 * 1_024;
const SHA256 = /^[a-f0-9]{64}$/;
function envelopePath(directory, inputDigest) {
    if (!SHA256.test(inputDigest)) {
        throw new TypeError("community title replay input digest is invalid");
    }
    return node_path_1.default.join(directory, `${inputDigest}.json`);
}
async function ensureReplayDirectory(directory) {
    await (0, meeting_refresh_llm_replay_js_1.assertPrivateDirectory)(node_path_1.default.dirname(directory), true);
    await (0, meeting_refresh_llm_replay_js_1.assertPrivateDirectory)(directory, true);
}
/**
 * Best-effort load of the recorded batch title envelope for the current
 * community set. Any storage or validation failure returns null so the
 * caller falls back to the live station or the deterministic titles.
 */
async function loadRecordedCommunityTitleEnvelope(scope, inputDigest) {
    try {
        await ensureReplayDirectory(scope.directory);
        const filePath = envelopePath(scope.directory, inputDigest);
        try {
            await (0, promises_1.lstat)(filePath);
        }
        catch {
            return null;
        }
        let recorded = null;
        try {
            const file = await (0, meeting_refresh_llm_replay_js_1.readAuthenticatedFile)(filePath, exports.TASKMAP_COMMUNITY_TITLE_ENVELOPE_MAX_BYTES, "owner_private");
            const decoded = new TextDecoder("utf-8", { fatal: true })
                .decode(file.bytes);
            (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(decoded);
            recorded = (0, community_root_proposals_js_1.taskMapCommunityRecordedTitleEnvelope)(JSON.parse(decoded), scope);
        }
        catch {
            recorded = null;
        }
        if (recorded === null) {
            // An unreadable or mismatched recording would otherwise block every
            // future recording at this key, because recordings never overwrite.
            await (0, promises_1.unlink)(filePath).catch(() => undefined);
        }
        return recorded;
    }
    catch {
        return null;
    }
}
/**
 * Wraps a live station so every valid community-title-v1 envelope it
 * produces is recorded for byte-identical replay in later generations.
 * Recording is best-effort and never affects the live result.
 */
function withCommunityTitleEnvelopeRecording(station, scope) {
    return {
        provider: station.provider,
        async run(request) {
            const envelope = await station.run(request);
            if (request.stationId === "community-title-v1") {
                const validated = (0, community_root_proposals_js_1.taskMapCommunityRecordedTitleEnvelope)(envelope, scope);
                if (validated !== null) {
                    try {
                        await ensureReplayDirectory(scope.directory);
                        await (0, meeting_refresh_llm_replay_js_1.atomicPrivateWriteNew)(envelopePath(scope.directory, validated.inputDigest), validated);
                    }
                    catch {
                        // A failed recording only costs one later live/deterministic run.
                    }
                }
            }
            return envelope;
        },
    };
}
