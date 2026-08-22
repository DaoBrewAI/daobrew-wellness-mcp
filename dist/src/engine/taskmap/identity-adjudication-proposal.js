"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1 = exports.TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1 = exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1 = exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID = exports.TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION = exports.TASKMAP_IDENTITY_ADJUDICATION_VERSION = void 0;
exports.buildTaskMapIdentityAdjudicationProposals = buildTaskMapIdentityAdjudicationProposals;
exports.adjudicateTaskMapIdentityPairs = adjudicateTaskMapIdentityPairs;
const llm_station_js_1 = require("./llm-station.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_IDENTITY_ADJUDICATION_VERSION = "taskmap-identity-adjudication.v1";
exports.TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION = "taskmap-identity-adjudication-result.v1";
exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID = "identity-adjudication-v1";
exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1 = Object.freeze({
    maxCandidates: 512,
    maxPairs: 2_048,
    maxTextCharacters: 512,
});
exports.TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1 = Object.freeze({
    maxEvidenceItems: 512,
    maxPromptCharacters: 1_048_576,
    maxVerdicts: 2_048,
    maxOutputBytes: llm_station_js_1.LLM_STATION_MAX_OUTPUT_BYTES,
});
exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1 = Object.freeze({
    blockThreshold: 0.82,
    autoBand: 0.95,
    embeddingDimensions: 768,
    similarity: "cosine_dot_product_l2_normalized",
});
const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAX_OPAQUE_ID_CHARACTERS = 512;
const MAX_MODEL_ID_CHARACTERS = 256;
const CANDIDATE_KEYS = Object.freeze([
    "candidateId",
    "rootId",
    "text",
]);
function fail(message) {
    throw new TypeError(`Task Map identity adjudication proposal: ${message}`);
}
function plainObject(value) {
    return value !== null
        && typeof value === "object"
        && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
function stableCompare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function stablePairCompare(left, right) {
    return stableCompare(left.leftCandidateId, right.leftCandidateId)
        || stableCompare(left.rightCandidateId, right.rightCandidateId);
}
function assertExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort(stableCompare);
    const wanted = [...expected].sort(stableCompare);
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        fail(`${label} keys are invalid`);
    }
}
function validOpaqueId(value) {
    return typeof value === "string"
        && value.length > 0
        && value.length <= MAX_OPAQUE_ID_CHARACTERS
        && !CONTROL_CHARACTERS.test(value);
}
function validModelId(value) {
    return typeof value === "string"
        && value.length > 0
        && value.length <= MAX_MODEL_ID_CHARACTERS
        && value === value.trim()
        && !CONTROL_CHARACTERS.test(value);
}
function validProducedAt(value) {
    if (typeof value !== "string")
        return false;
    const match = STRICT_RFC3339.exec(value);
    if (match === null || !Number.isFinite(Date.parse(value)))
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
    const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    return month >= 1
        && month <= 12
        && day >= 1
        && day <= daysInMonth[month - 1]
        && hour <= 23
        && minute <= 59
        && second <= 59
        && offsetHour <= 23
        && offsetMinute <= 59;
}
function validateAndNormalizeCandidates(candidates) {
    if (!Array.isArray(candidates))
        fail("candidates are invalid");
    if (candidates.length > exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates) {
        fail("candidate collection exceeds its bounded ceiling");
    }
    const seenCandidateIds = new Set();
    const normalized = candidates.map((candidate, index) => {
        if (!plainObject(candidate))
            fail(`candidate ${index} is invalid`);
        assertExactKeys(candidate, CANDIDATE_KEYS, `candidate ${index}`);
        if (!validOpaqueId(candidate.candidateId)
            || !validOpaqueId(candidate.rootId)) {
            fail(`candidate ${index} identity is invalid`);
        }
        if (typeof candidate.text !== "string"
            || candidate.text.length === 0
            || candidate.text.length
                > exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxTextCharacters
            || CONTROL_CHARACTERS.test(candidate.text)) {
            fail(`candidate ${index} text exceeds its bounded contract`);
        }
        if (seenCandidateIds.has(candidate.candidateId)) {
            fail(`candidate ${index} repeats a candidate id`);
        }
        seenCandidateIds.add(candidate.candidateId);
        return {
            candidateId: candidate.candidateId,
            rootId: candidate.rootId,
            text: candidate.text,
        };
    });
    return normalized.sort((left, right) => stableCompare(left.candidateId, right.candidateId));
}
function normalizedDotProduct(left, right) {
    if (left.length === 0 || left.length !== right.length) {
        throw new Error("embedding dimensions are invalid");
    }
    let dotProduct = 0;
    let leftSumSquares = 0;
    let rightSumSquares = 0;
    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index];
        const rightValue = right[index];
        if (typeof leftValue !== "number"
            || !Number.isFinite(leftValue)
            || typeof rightValue !== "number"
            || !Number.isFinite(rightValue)) {
            throw new Error("embedding values are invalid");
        }
        dotProduct += leftValue * rightValue;
        leftSumSquares += leftValue * leftValue;
        rightSumSquares += rightValue * rightValue;
    }
    const denominator = Math.sqrt(leftSumSquares) * Math.sqrt(rightSumSquares);
    if (!Number.isFinite(denominator) || denominator === 0) {
        throw new Error("embedding norm is invalid");
    }
    return Math.max(-1, Math.min(1, dotProduct / denominator));
}
function sealedArtifact(base) {
    return {
        ...base,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(base),
    };
}
function baseBoundary(input) {
    return {
        contractVersion: exports.TASKMAP_IDENTITY_ADJUDICATION_VERSION,
        inputDigest: input.inputDigest,
        embeddingModelId: input.embeddingModelId,
        evidenceManifest: input.evidenceManifest,
        policy: { ...exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1 },
        blockingState: input.blockingState,
        unavailableReason: input.unavailableReason,
        candidateCount: input.candidateCount,
        pairs: input.pairs,
        crossRootFlagged: input.crossRootFlagged,
        authority: {
            mergeApplied: false,
            aliasesWritten: false,
            requiresOwnerAcceptance: true,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
}
function pairId(leftCandidateId, rightCandidateId) {
    return `tmidentitypair_${(0, source_contracts_js_1.taskMapContractDigest)({
        contractVersion: exports.TASKMAP_IDENTITY_ADJUDICATION_VERSION,
        leftCandidateId,
        rightCandidateId,
    })}`;
}
async function buildTaskMapIdentityAdjudicationProposals(input) {
    if (!plainObject(input))
        fail("input is invalid");
    if (!SHA256.test(input.inputDigest))
        fail("input digest is invalid");
    if (!validModelId(input.embeddingModelId))
        fail("embedding model id is invalid");
    if (input.embeddingProvider === null
        || (typeof input.embeddingProvider !== "object"
            && typeof input.embeddingProvider !== "function")
        || typeof input.embeddingProvider.embed !== "function") {
        fail("embedding provider is invalid");
    }
    // Complete every deterministic input and collection-bound check before the
    // provider boundary so invalid work cannot trigger an external call.
    const candidates = validateAndNormalizeCandidates(input.candidates);
    const evidenceManifest = candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        rootId: candidate.rootId,
        textDigest: (0, source_contracts_js_1.taskMapContractDigest)(candidate.text),
    }));
    if (candidates.length < 2) {
        return sealedArtifact(baseBoundary({
            inputDigest: input.inputDigest,
            embeddingModelId: input.embeddingModelId,
            evidenceManifest,
            candidateCount: candidates.length,
            blockingState: "current",
            unavailableReason: null,
            pairs: [],
            crossRootFlagged: [],
        }));
    }
    let embeddings;
    try {
        embeddings = await input.embeddingProvider.embed(candidates.map((candidate) => candidate.text));
        if (!Array.isArray(embeddings) || embeddings.length !== candidates.length) {
            throw new Error("embedding count is invalid");
        }
        for (const embedding of embeddings) {
            if (!Array.isArray(embedding)
                || embedding.length
                    !== exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions) {
                throw new Error("embedding dimensions do not match the frozen policy");
            }
            // Validate every vector, including vectors that never form a pair.
            normalizedDotProduct(embedding, embedding);
        }
    }
    catch (_error) {
        return sealedArtifact(baseBoundary({
            inputDigest: input.inputDigest,
            embeddingModelId: input.embeddingModelId,
            evidenceManifest,
            candidateCount: candidates.length,
            blockingState: "unavailable",
            unavailableReason: "embedding_provider_failed",
            pairs: [],
            crossRootFlagged: [],
        }));
    }
    const pairs = [];
    const crossRootFlagged = [];
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
        const left = candidates[leftIndex];
        const leftEmbedding = embeddings[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
            const right = candidates[rightIndex];
            const similarity = normalizedDotProduct(leftEmbedding, embeddings[rightIndex]);
            if (similarity < exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold) {
                continue;
            }
            if (pairs.length + crossRootFlagged.length
                >= exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxPairs) {
                fail("pair collection exceeds its bounded ceiling");
            }
            const confidence = similarity
                >= exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand
                ? "high"
                : "ambiguous";
            const normalizedPairId = pairId(left.candidateId, right.candidateId);
            if (left.rootId !== right.rootId) {
                crossRootFlagged.push({
                    pairId: normalizedPairId,
                    leftCandidateId: left.candidateId,
                    rightCandidateId: right.candidateId,
                    leftRootId: left.rootId,
                    rightRootId: right.rootId,
                    similarity,
                    confidence,
                });
                continue;
            }
            pairs.push({
                pairId: normalizedPairId,
                leftCandidateId: left.candidateId,
                rightCandidateId: right.candidateId,
                rootId: left.rootId,
                similarity,
                confidence,
            });
        }
    }
    pairs.sort(stablePairCompare);
    crossRootFlagged.sort(stablePairCompare);
    return sealedArtifact(baseBoundary({
        inputDigest: input.inputDigest,
        embeddingModelId: input.embeddingModelId,
        evidenceManifest,
        candidateCount: candidates.length,
        blockingState: "current",
        unavailableReason: null,
        pairs,
        crossRootFlagged,
    }));
}
const EVIDENCE_KEYS = Object.freeze(["candidateId", "text"]);
const PROPOSAL_KEYS = Object.freeze([
    "contractVersion",
    "inputDigest",
    "embeddingModelId",
    "evidenceManifest",
    "policy",
    "blockingState",
    "unavailableReason",
    "candidateCount",
    "pairs",
    "crossRootFlagged",
    "authority",
    "privacy",
    "artifactDigest",
]);
const PROPOSAL_PAIR_KEYS = Object.freeze([
    "pairId",
    "leftCandidateId",
    "rightCandidateId",
    "rootId",
    "similarity",
    "confidence",
]);
const CROSS_ROOT_FLAG_KEYS = Object.freeze([
    "pairId",
    "leftCandidateId",
    "rightCandidateId",
    "leftRootId",
    "rightRootId",
    "similarity",
    "confidence",
]);
const EVIDENCE_MANIFEST_KEYS = Object.freeze([
    "candidateId",
    "rootId",
    "textDigest",
]);
const POLICY_KEYS = Object.freeze([
    "blockThreshold",
    "autoBand",
    "embeddingDimensions",
    "similarity",
]);
const AUTHORITY_KEYS = Object.freeze([
    "mergeApplied",
    "aliasesWritten",
    "requiresOwnerAcceptance",
]);
const PRIVACY_KEYS = Object.freeze([
    "sourceBodiesStored",
    "localPathsStored",
    "rawBiometricsStored",
]);
const LLM_OUTPUT_KEYS = Object.freeze(["verdicts"]);
const LLM_VERDICT_KEYS = Object.freeze(["pairId", "verdict"]);
const LLM_ENVELOPE_KEYS = Object.freeze([
    "stationId",
    "model",
    "promptDigest",
    "inputDigest",
    "outputJson",
    "producedAt",
    "transport",
]);
function validateProposalForAdjudication(proposal) {
    if (!plainObject(proposal))
        fail("adjudication proposal is invalid");
    assertExactKeys(proposal, PROPOSAL_KEYS, "adjudication proposal");
    if (proposal.contractVersion !== exports.TASKMAP_IDENTITY_ADJUDICATION_VERSION
        || !SHA256.test(proposal.inputDigest)
        || !Number.isSafeInteger(proposal.candidateCount)
        || proposal.candidateCount < 0
        || proposal.candidateCount > exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates
        || !Array.isArray(proposal.evidenceManifest)
        || !Array.isArray(proposal.pairs)
        || !Array.isArray(proposal.crossRootFlagged)) {
        fail("adjudication proposal contract is invalid");
    }
    if (!plainObject(proposal.policy))
        fail("adjudication policy is invalid");
    assertExactKeys(proposal.policy, POLICY_KEYS, "adjudication policy");
    if (proposal.policy.blockThreshold
        !== exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold
        || proposal.policy.autoBand
            !== exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand
        || proposal.policy.embeddingDimensions
            !== exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions
        || proposal.policy.similarity
            !== exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.similarity) {
        fail("adjudication policy is not canonical");
    }
    if (!plainObject(proposal.authority))
        fail("adjudication authority is invalid");
    assertExactKeys(proposal.authority, AUTHORITY_KEYS, "adjudication authority");
    if (proposal.authority.mergeApplied !== false
        || proposal.authority.aliasesWritten !== false
        || proposal.authority.requiresOwnerAcceptance !== true) {
        fail("adjudication authority is not canonical");
    }
    if (!plainObject(proposal.privacy))
        fail("adjudication privacy is invalid");
    assertExactKeys(proposal.privacy, PRIVACY_KEYS, "adjudication privacy");
    if (proposal.privacy.sourceBodiesStored !== false
        || proposal.privacy.localPathsStored !== false
        || proposal.privacy.rawBiometricsStored !== false) {
        fail("adjudication privacy is not canonical");
    }
    if (proposal.evidenceManifest.length !== proposal.candidateCount
        || proposal.evidenceManifest.length
            > exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates
        || proposal.pairs.length + proposal.crossRootFlagged.length
            > exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxPairs) {
        fail("adjudication proposal collections exceed their bounded contract");
    }
    if (proposal.blockingState === "unavailable") {
        if (proposal.unavailableReason !== "embedding_provider_failed"
            || proposal.pairs.length !== 0
            || proposal.crossRootFlagged.length !== 0) {
            fail("unavailable adjudication proposal is inconsistent");
        }
    }
    else if (proposal.blockingState !== "current"
        || proposal.unavailableReason !== null) {
        fail("current adjudication proposal is inconsistent");
    }
    const candidateRoots = new Map();
    let previousCandidateId;
    for (const [index, evidence] of proposal.evidenceManifest.entries()) {
        if (!plainObject(evidence))
            fail(`evidence manifest ${index} is invalid`);
        assertExactKeys(evidence, EVIDENCE_MANIFEST_KEYS, `evidence manifest ${index}`);
        if (!validOpaqueId(evidence.candidateId)
            || !validOpaqueId(evidence.rootId)
            || typeof evidence.textDigest !== "string"
            || !SHA256.test(evidence.textDigest)
            || (previousCandidateId !== undefined
                && stableCompare(previousCandidateId, evidence.candidateId) >= 0)) {
            fail(`evidence manifest ${index} is invalid or unsorted`);
        }
        previousCandidateId = evidence.candidateId;
        candidateRoots.set(evidence.candidateId, evidence.rootId);
    }
    const seenPairIds = new Set();
    let previousPair;
    for (const [index, pair] of proposal.pairs.entries()) {
        if (!plainObject(pair)) {
            fail(`adjudication proposal pair ${index} is invalid`);
        }
        assertExactKeys(pair, PROPOSAL_PAIR_KEYS, `adjudication proposal pair ${index}`);
        if (!validOpaqueId(pair.pairId)
            || !validOpaqueId(pair.leftCandidateId)
            || !validOpaqueId(pair.rightCandidateId)
            || !validOpaqueId(pair.rootId)
            || pair.leftCandidateId >= pair.rightCandidateId
            || typeof pair.similarity !== "number"
            || !Number.isFinite(pair.similarity)
            || pair.similarity < exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold
            || pair.similarity > 1
            || (pair.confidence !== "ambiguous" && pair.confidence !== "high")
            || pair.pairId !== pairId(pair.leftCandidateId, pair.rightCandidateId)
            || pair.confidence !== (pair.similarity >= exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand
                ? "high"
                : "ambiguous")
            || candidateRoots.get(pair.leftCandidateId) !== pair.rootId
            || candidateRoots.get(pair.rightCandidateId) !== pair.rootId
            || (previousPair !== undefined && stablePairCompare(previousPair, pair) >= 0)) {
            fail(`adjudication proposal pair ${index} is invalid`);
        }
        if (seenPairIds.has(pair.pairId)) {
            fail(`adjudication proposal pair ${index} repeats a pair id`);
        }
        seenPairIds.add(pair.pairId);
        previousPair = pair;
    }
    let previousCrossRoot;
    for (const [index, flag] of proposal.crossRootFlagged.entries()) {
        if (!plainObject(flag))
            fail(`cross-root flag ${index} is invalid`);
        assertExactKeys(flag, CROSS_ROOT_FLAG_KEYS, `cross-root flag ${index}`);
        if (!validOpaqueId(flag.pairId)
            || !validOpaqueId(flag.leftCandidateId)
            || !validOpaqueId(flag.rightCandidateId)
            || !validOpaqueId(flag.leftRootId)
            || !validOpaqueId(flag.rightRootId)
            || flag.leftCandidateId >= flag.rightCandidateId
            || flag.leftRootId === flag.rightRootId
            || typeof flag.similarity !== "number"
            || !Number.isFinite(flag.similarity)
            || flag.similarity < exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold
            || flag.similarity > 1
            || (flag.confidence !== "ambiguous" && flag.confidence !== "high")
            || flag.pairId !== pairId(flag.leftCandidateId, flag.rightCandidateId)
            || flag.confidence !== (flag.similarity >= exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand
                ? "high"
                : "ambiguous")
            || candidateRoots.get(flag.leftCandidateId) !== flag.leftRootId
            || candidateRoots.get(flag.rightCandidateId) !== flag.rightRootId
            || (previousCrossRoot !== undefined
                && stablePairCompare(previousCrossRoot, flag) >= 0)
            || seenPairIds.has(flag.pairId)) {
            fail(`cross-root flag ${index} is invalid`);
        }
        seenPairIds.add(flag.pairId);
        previousCrossRoot = flag;
    }
    if (!validModelId(proposal.embeddingModelId)
        || !SHA256.test(proposal.artifactDigest)) {
        fail("adjudication proposal provenance is invalid");
    }
    const { artifactDigest: _artifactDigest, ...base } = proposal;
    if ((0, source_contracts_js_1.taskMapContractDigest)(base) !== proposal.artifactDigest) {
        fail("adjudication proposal digest is invalid");
    }
}
function evidenceForAmbiguousPairs(ambiguousPairs, evidence, manifest) {
    if (!Array.isArray(evidence))
        throw new Error("candidate evidence is unavailable");
    if (evidence.length > exports.TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxEvidenceItems) {
        throw new Error("candidate evidence exceeds its bounded ceiling");
    }
    const required = new Set(ambiguousPairs.flatMap((pair) => [pair.leftCandidateId, pair.rightCandidateId]));
    const manifestByCandidateId = new Map(manifest.map((item) => [item.candidateId, item.textDigest]));
    const byCandidateId = new Map();
    for (const [index, item] of evidence.entries()) {
        if (!plainObject(item))
            throw new Error(`candidate evidence ${index} is invalid`);
        assertExactKeys(item, EVIDENCE_KEYS, `candidate evidence ${index}`);
        if (!validOpaqueId(item.candidateId)
            || typeof item.text !== "string"
            || item.text.length === 0
            || item.text.length > exports.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxTextCharacters
            || CONTROL_CHARACTERS.test(item.text)
            || byCandidateId.has(item.candidateId)
            || manifestByCandidateId.get(item.candidateId)
                !== (0, source_contracts_js_1.taskMapContractDigest)(item.text)) {
            throw new Error(`candidate evidence ${index} is invalid`);
        }
        byCandidateId.set(item.candidateId, {
            candidateId: item.candidateId,
            text: item.text,
        });
    }
    const selected = [...required]
        .sort(stableCompare)
        .map((candidateId) => {
        const item = byCandidateId.get(candidateId);
        if (item === undefined)
            throw new Error("candidate evidence is incomplete");
        return item;
    });
    return selected;
}
function buildIdentityAdjudicationPrompt(ambiguousPairs, evidence) {
    const prompt = JSON.stringify({
        stationId: exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
        instructions: [
            "Decide whether each pair identifies the same concrete unit of work.",
            "Return strict JSON only, with exactly one verdict per supplied pair.",
            "Use verdict same_work only when the evidence denotes one work identity; otherwise use different_work.",
        ],
        outputSchema: {
            verdicts: [{ pairId: "string", verdict: "same_work|different_work" }],
        },
        candidateEvidence: evidence,
        pairs: ambiguousPairs.map((pair) => ({
            pairId: pair.pairId,
            leftCandidateId: pair.leftCandidateId,
            rightCandidateId: pair.rightCandidateId,
            rootId: pair.rootId,
            similarity: pair.similarity,
        })),
    });
    if (prompt.length === 0
        || prompt.length > exports.TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxPromptCharacters) {
        throw new Error("identity adjudication prompt exceeds its bounded ceiling");
    }
    return prompt;
}
function validateVerdicts(outputJson, ambiguousPairs) {
    if (typeof outputJson !== "string"
        || Buffer.byteLength(outputJson, "utf8")
            > exports.TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxOutputBytes) {
        throw new Error("identity adjudication output exceeds its bounded ceiling");
    }
    const trimmed = outputJson.trim();
    (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(trimmed);
    const parsed = JSON.parse(trimmed);
    if (!plainObject(parsed))
        throw new Error("identity adjudication output is invalid");
    assertExactKeys(parsed, LLM_OUTPUT_KEYS, "identity adjudication output");
    if (!Array.isArray(parsed.verdicts)
        || parsed.verdicts.length !== ambiguousPairs.length
        || parsed.verdicts.length
            > exports.TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxVerdicts) {
        throw new Error("identity adjudication verdict collection is invalid");
    }
    const expectedPairIds = new Set(ambiguousPairs.map((pair) => pair.pairId));
    const verdicts = new Map();
    for (const [index, value] of parsed.verdicts.entries()) {
        if (!plainObject(value))
            throw new Error(`identity verdict ${index} is invalid`);
        assertExactKeys(value, LLM_VERDICT_KEYS, `identity verdict ${index}`);
        if (typeof value.pairId !== "string"
            || !expectedPairIds.has(value.pairId)
            || verdicts.has(value.pairId)
            || (value.verdict !== "same_work" && value.verdict !== "different_work")) {
            throw new Error(`identity verdict ${index} is invalid`);
        }
        verdicts.set(value.pairId, value.verdict);
    }
    if (verdicts.size !== expectedPairIds.size) {
        throw new Error("identity adjudication verdicts are incomplete");
    }
    return verdicts;
}
async function runOfflineIdentityAdjudication(runner, prompt, ambiguousPairs) {
    if (typeof runner !== "function")
        throw new Error("LLM runner is unavailable");
    const abortController = new AbortController();
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            abortController.abort();
            reject(new Error("identity adjudication runner timed out"));
        }, llm_station_js_1.LLM_STATION_TIMEOUT_MS);
    });
    timer?.unref();
    try {
        const result = await Promise.race([
            runner({
                executable: exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
                args: Object.freeze([]),
                stdin: prompt,
                timeoutMs: llm_station_js_1.LLM_STATION_TIMEOUT_MS,
                signal: abortController.signal,
            }),
            timeout,
        ]);
        if (!plainObject(result)
            || result.exitCode !== 0
            || typeof result.stdout !== "string"
            || typeof result.stderr !== "string"
            || Buffer.byteLength(result.stderr, "utf8")
                > exports.TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxOutputBytes) {
            throw new Error("identity adjudication runner result is invalid");
        }
        return validateVerdicts(result.stdout, ambiguousPairs);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
function validLlmTransport(value) {
    return value === "claude-cli"
        || value === "codex-cli"
        || value === "cursor-cli"
        || value === "gemini-remote";
}
async function runStationIdentityAdjudication(station, prompt, inputDigest, ambiguousPairs) {
    const expectedPromptDigest = (0, source_contracts_js_1.taskMapContractDigest)(prompt);
    const envelope = await station.run({
        stationId: exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
        promptText: prompt,
        inputDigest,
    });
    if (!plainObject(envelope))
        throw new Error("LLM station envelope is invalid");
    assertExactKeys(envelope, LLM_ENVELOPE_KEYS, "LLM station envelope");
    if (envelope.stationId !== exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID
        || envelope.inputDigest !== inputDigest
        || envelope.promptDigest !== expectedPromptDigest
        || typeof envelope.outputJson !== "string"
        || !validModelId(envelope.model)
        || !validLlmTransport(envelope.transport)
        || envelope.transport !== station.provider.transport
        || !validProducedAt(envelope.producedAt)) {
        throw new Error("LLM station envelope does not match its request");
    }
    return {
        verdicts: validateVerdicts(envelope.outputJson, ambiguousPairs),
        modelId: envelope.model,
        transport: envelope.transport,
    };
}
function sealAdjudicationResult(base) {
    return { ...base, artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(base) };
}
/**
 * Produces owner-gated identity proposals. Raw candidate evidence is used only
 * to construct the deterministic prompt and is never copied into the artifact.
 */
async function adjudicateTaskMapIdentityPairs(input) {
    if (!plainObject(input))
        fail("adjudication input is invalid");
    const hasStation = input.station !== undefined;
    const hasRunner = input.runner !== undefined;
    if (hasStation === hasRunner) {
        fail("exactly one station or runner seam is required");
    }
    if (hasStation
        && (input.station === null
            || (typeof input.station !== "object" && typeof input.station !== "function")
            || typeof input.station.run !== "function")) {
        fail("station seam is invalid");
    }
    if (hasRunner && typeof input.runner !== "function") {
        fail("offline runner seam is invalid");
    }
    if (hasRunner && !validModelId(input.llmModelId)) {
        fail("offline runner model provenance is invalid");
    }
    validateProposalForAdjudication(input.proposals);
    const proposalPairs = [...input.proposals.pairs].sort(stablePairCompare);
    const ambiguousPairs = proposalPairs.filter((pair) => pair.confidence === "ambiguous");
    let llm = {
        invocationState: "not_invoked",
        stationId: exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
        modelId: null,
        transport: null,
        promptDigest: null,
    };
    let llmVerdicts;
    if (ambiguousPairs.length > 0) {
        let promptDigest = null;
        try {
            const evidence = evidenceForAmbiguousPairs(ambiguousPairs, input.candidateEvidence, input.proposals.evidenceManifest);
            const prompt = buildIdentityAdjudicationPrompt(ambiguousPairs, evidence);
            promptDigest = (0, source_contracts_js_1.taskMapContractDigest)(prompt);
            if (hasStation) {
                const result = await runStationIdentityAdjudication(input.station, prompt, input.proposals.inputDigest, ambiguousPairs);
                llmVerdicts = result.verdicts;
                llm = {
                    invocationState: "invoked",
                    stationId: exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
                    modelId: result.modelId,
                    transport: result.transport,
                    promptDigest,
                };
            }
            else {
                llmVerdicts = await runOfflineIdentityAdjudication(input.runner, prompt, ambiguousPairs);
                llm = {
                    invocationState: "invoked",
                    stationId: exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
                    modelId: input.llmModelId,
                    transport: "injected-offline",
                    promptDigest,
                };
            }
        }
        catch (_error) {
            llmVerdicts = undefined;
            llm = {
                invocationState: "unavailable",
                stationId: exports.TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
                modelId: hasRunner ? input.llmModelId : null,
                transport: hasRunner ? "injected-offline" : null,
                promptDigest,
            };
        }
    }
    const pairs = proposalPairs.map((pair) => {
        if (pair.confidence === "high") {
            return {
                ...pair,
                adjudication: "same_work",
                adjudicationSource: "embedding_high_confidence",
                deferredReason: null,
            };
        }
        const verdict = llmVerdicts?.get(pair.pairId);
        return verdict === undefined
            ? {
                ...pair,
                adjudication: "deferred",
                adjudicationSource: "deferred",
                deferredReason: "llm_station_unavailable",
            }
            : {
                ...pair,
                adjudication: verdict,
                adjudicationSource: "llm_identity_adjudication",
                deferredReason: null,
            };
    });
    const verdicts = pairs.map((pair) => ({
        pairId: pair.pairId,
        verdict: pair.adjudication,
        source: pair.adjudicationSource,
    }));
    const mergeCandidates = pairs.filter((pair) => pair.adjudication === "same_work");
    return sealAdjudicationResult({
        contractVersion: exports.TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION,
        inputDigest: input.proposals.inputDigest,
        proposalArtifactDigest: input.proposals.artifactDigest,
        embedding: {
            modelId: input.proposals.embeddingModelId,
            dimensions: exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions,
            similarity: exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.similarity,
            blockThreshold: exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold,
            autoBand: exports.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand,
        },
        llm,
        pairs,
        verdicts,
        mergeCandidates,
        authority: {
            mergeApplied: false,
            aliasesWritten: false,
            requiresOwnerAcceptance: true,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    });
}
