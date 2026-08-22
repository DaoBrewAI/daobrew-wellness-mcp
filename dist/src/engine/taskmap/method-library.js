"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1 = exports.TASKMAP_DECOMPOSITION_STATION_ID = exports.TASKMAP_DECOMPOSITION_PROPOSAL_VERSION = exports.TASKMAP_METHOD_LIBRARY_VERSION = void 0;
exports.buildTaskMapMethodLibrary = buildTaskMapMethodLibrary;
exports.proposeTaskMapDecomposition = proposeTaskMapDecomposition;
const mention_extraction_js_1 = require("./mention-extraction.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_METHOD_LIBRARY_VERSION = "taskmap-method-library.v1";
exports.TASKMAP_DECOMPOSITION_PROPOSAL_VERSION = "taskmap-decomposition-proposal.v1";
exports.TASKMAP_DECOMPOSITION_STATION_ID = "task-decomposition-v1";
exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1 = Object.freeze({
    maxTemplates: 128,
    maxCandidateProposals: 16,
    maxPublishedProposals: 3,
    maxSubtasksPerProposal: 16,
    maxPromptCharacters: 32_768,
    maxOutputBytes: 65_536,
    maxArtifactBytes: 1_048_576,
    maxIdCharacters: 512,
    maxDomainSignatureCharacters: 128,
    maxTitleCharacters: 256,
    maxSummaryCharacters: 1_024,
    maxCitationPointers: 32,
    maxModelCharacters: 256,
});
const SHA256 = /^[a-f0-9]{64}$/;
const DOMAIN_SIGNATURE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const CONTROL = /\p{Cc}/u;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const TEMPLATE_KEYS = ["templateId", "domainSignature", "methodId", "subtasks"];
const TEMPLATE_SUBTASK_KEYS = ["title", "summary"];
const LIBRARY_AUTHORITY_KEYS = ["edgesWritten", "requiresOwnerAcceptance"];
const LIBRARY_PRIVACY_KEYS = [
    "sourceBodiesStored",
    "localPathsStored",
    "rawBiometricsStored",
];
const WORK_KEYS = ["taskId", "domainSignature", "title", "summary", "citationPointerIds"];
const LLM_OUTPUT_KEYS = ["proposals"];
const LLM_PROPOSAL_KEYS = ["methodId", "subtasks"];
const LLM_SUBTASK_KEYS = ["title", "summary", "citationPointerIds"];
const LLM_PROVIDER_KEYS = ["transport", "executable", "args", "model"];
const LLM_ENVELOPE_KEYS = [
    "stationId",
    "model",
    "promptDigest",
    "inputDigest",
    "outputJson",
    "producedAt",
    "transport",
];
function fail(message) {
    throw new TypeError(`Task Map Station-3 method library: ${message}`);
}
function plain(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function exactKeys(value, keys, label) {
    const actual = Object.keys(value).sort(compareText);
    const expected = [...keys].sort(compareText);
    if (actual.length !== expected.length
        || actual.some((key, index) => key !== expected[index])) {
        fail(`${label} keys are invalid`);
    }
}
function boundedText(value, maximum) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
        && !CONTROL.test(value);
}
function opaqueId(value) {
    return boundedText(value, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxIdCharacters)
        && value === value.trim();
}
function modelId(value) {
    return boundedText(value, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxModelCharacters)
        && value === value.trim();
}
function validLlmTransport(value) {
    return value === "claude-cli"
        || value === "codex-cli"
        || value === "cursor-cli"
        || value === "gemini-remote";
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
    return month >= 1 && month <= 12
        && day >= 1 && day <= daysInMonth[month - 1]
        && hour <= 23 && minute <= 59 && second <= 59
        && offsetHour <= 23 && offsetMinute <= 59;
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value))
            deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}
function normalizeTemplate(value, index) {
    if (!plain(value))
        fail(`template ${index} is invalid`);
    exactKeys(value, TEMPLATE_KEYS, `template ${index}`);
    if (!opaqueId(value.templateId) || !opaqueId(value.methodId)
        || typeof value.domainSignature !== "string"
        || !DOMAIN_SIGNATURE.test(value.domainSignature)
        || !Array.isArray(value.subtasks) || value.subtasks.length === 0
        || value.subtasks.length > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSubtasksPerProposal) {
        fail(`template ${index} is invalid or unbounded`);
    }
    const subtasks = value.subtasks.map((subtask, subtaskIndex) => {
        if (!plain(subtask))
            fail(`template ${index} subtask ${subtaskIndex} is invalid`);
        exactKeys(subtask, TEMPLATE_SUBTASK_KEYS, `template ${index} subtask ${subtaskIndex}`);
        if (!boundedText(subtask.title, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxTitleCharacters)
            || !boundedText(subtask.summary, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSummaryCharacters)) {
            fail(`template ${index} subtask ${subtaskIndex} is invalid or unbounded`);
        }
        return { title: subtask.title, summary: subtask.summary };
    });
    return {
        templateId: value.templateId,
        domainSignature: value.domainSignature,
        methodId: value.methodId,
        subtasks,
    };
}
function buildTaskMapMethodLibrary(input) {
    if (!plain(input))
        fail("library draft is invalid");
    exactKeys(input, ["templates"], "library draft");
    if (!Array.isArray(input.templates)
        || input.templates.length > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxTemplates) {
        fail("library template collection is invalid or unbounded");
    }
    const templates = input.templates.map(normalizeTemplate).sort((left, right) => compareText(left.domainSignature, right.domainSignature)
        || compareText(left.templateId, right.templateId));
    if (new Set(templates.map((template) => template.domainSignature)).size
        !== templates.length)
        fail("library domain signatures must be unique");
    if (new Set(templates.map((template) => template.templateId)).size
        !== templates.length)
        fail("library template ids must be unique");
    const core = {
        contractVersion: exports.TASKMAP_METHOD_LIBRARY_VERSION,
        templates,
        authority: {
            edgesWritten: false,
            requiresOwnerAcceptance: true,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
    const result = { ...core, artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core) };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(result), "utf8")
        > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxArtifactBytes) {
        fail("library artifact exceeds its bounded ceiling");
    }
    return deepFreeze(result);
}
function validateLibrary(library) {
    if (!plain(library))
        fail("library is invalid");
    exactKeys(library, [
        "contractVersion",
        "templates",
        "authority",
        "privacy",
        "artifactDigest",
    ], "library");
    if (library.contractVersion !== exports.TASKMAP_METHOD_LIBRARY_VERSION
        || typeof library.artifactDigest !== "string" || !SHA256.test(library.artifactDigest)
        || !Array.isArray(library.templates))
        fail("library binding is invalid");
    const authority = library.authority;
    if (!plain(authority))
        fail("library authority is invalid");
    exactKeys(authority, LIBRARY_AUTHORITY_KEYS, "library authority");
    if (authority.edgesWritten !== false
        || authority.requiresOwnerAcceptance !== true) {
        fail("library authority is not fail closed");
    }
    const privacy = library.privacy;
    if (!plain(privacy))
        fail("library privacy is invalid");
    exactKeys(privacy, LIBRARY_PRIVACY_KEYS, "library privacy");
    if (LIBRARY_PRIVACY_KEYS.some((key) => privacy[key] !== false)) {
        fail("library privacy is not fail closed");
    }
    const rebuilt = buildTaskMapMethodLibrary({
        templates: library.templates,
    });
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(library) !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(rebuilt)) {
        fail("library canonical seal is invalid");
    }
}
function validateWorkItem(value) {
    if (!plain(value))
        fail("work item is invalid");
    exactKeys(value, WORK_KEYS, "work item");
    if (!opaqueId(value.taskId) || typeof value.domainSignature !== "string"
        || !DOMAIN_SIGNATURE.test(value.domainSignature)
        || !boundedText(value.title, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxTitleCharacters)
        || !boundedText(value.summary, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSummaryCharacters)
        || !Array.isArray(value.citationPointerIds)
        || value.citationPointerIds.length > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxCitationPointers
        || value.citationPointerIds.some((pointer) => !opaqueId(pointer))
        || new Set(value.citationPointerIds).size !== value.citationPointerIds.length) {
        fail("work item is invalid or unbounded");
    }
}
function makeProposal(workItem, methodIdValue, subtasks, ordinal) {
    const proposalSeed = { taskId: workItem.taskId, methodId: methodIdValue, subtasks, ordinal };
    const proposalId = `tmdecomp_${(0, source_contracts_js_1.taskMapContractDigest)(proposalSeed).slice(0, 16)}`;
    return {
        proposalId,
        methodId: methodIdValue,
        subtasks: subtasks.map((subtask, index) => ({
            subtaskId: `tmds_${(0, source_contracts_js_1.taskMapContractDigest)({ proposalId, index, subtask }).slice(0, 16)}`,
            title: subtask.title,
            summary: subtask.summary,
            citationPointerIds: [...subtask.citationPointerIds],
        })),
    };
}
function parseOutput(outputJson, workItem) {
    if (typeof outputJson !== "string"
        || Buffer.byteLength(outputJson, "utf8") > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxOutputBytes) {
        fail("LLM output is invalid or unbounded");
    }
    (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(outputJson.trim());
    const parsed = JSON.parse(outputJson.trim());
    if (!plain(parsed))
        fail("LLM output is invalid");
    exactKeys(parsed, LLM_OUTPUT_KEYS, "LLM output");
    if (!Array.isArray(parsed.proposals)
        || parsed.proposals.length === 0
        || parsed.proposals.length > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxCandidateProposals) {
        fail("LLM proposal collection is invalid or unbounded");
    }
    const proposals = parsed.proposals.map((proposal, proposalIndex) => {
        if (!plain(proposal))
            fail(`LLM proposal ${proposalIndex} is invalid`);
        exactKeys(proposal, LLM_PROPOSAL_KEYS, `LLM proposal ${proposalIndex}`);
        if (!opaqueId(proposal.methodId) || !Array.isArray(proposal.subtasks)
            || proposal.subtasks.length === 0
            || proposal.subtasks.length > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSubtasksPerProposal) {
            fail(`LLM proposal ${proposalIndex} is invalid or unbounded`);
        }
        const subtasks = proposal.subtasks.map((subtask, subtaskIndex) => {
            if (!plain(subtask))
                fail(`LLM subtask ${subtaskIndex} is invalid`);
            exactKeys(subtask, LLM_SUBTASK_KEYS, `LLM subtask ${subtaskIndex}`);
            if (!boundedText(subtask.title, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxTitleCharacters)
                || !boundedText(subtask.summary, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSummaryCharacters)
                || !Array.isArray(subtask.citationPointerIds)
                || subtask.citationPointerIds.length === 0
                || subtask.citationPointerIds.length > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxCitationPointers
                || subtask.citationPointerIds.some((pointer) => !opaqueId(pointer))) {
                fail(`LLM subtask ${subtaskIndex} is invalid or unbounded`);
            }
            return {
                title: subtask.title,
                summary: subtask.summary,
                citationPointerIds: [...subtask.citationPointerIds],
            };
        });
        return makeProposal(workItem, proposal.methodId, subtasks, proposalIndex);
    });
    return proposals.slice(0, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxPublishedProposals);
}
function promptFor(workItem) {
    const prompt = JSON.stringify({
        stationId: exports.TASKMAP_DECOMPOSITION_STATION_ID,
        instructions: [
            "Propose one to three alternative decompositions for exactly one work item.",
            "Return one level only; subtasks must never contain children or edges.",
            "Return strict JSON with proposals[{methodId,subtasks[{title,summary,citationPointerIds}]}].",
        ],
        workItem,
    });
    if (prompt.length > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxPromptCharacters) {
        fail("Station-3 prompt is unbounded");
    }
    return prompt;
}
function baseResult(inputDigest, libraryDigest, source, unavailableReason, proposals, llm) {
    const core = {
        contractVersion: exports.TASKMAP_DECOMPOSITION_PROPOSAL_VERSION,
        inputDigest,
        libraryDigest,
        source,
        unavailableReason,
        proposals,
        llm,
        authority: { edgesWritten: false, requiresOwnerAcceptance: true },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
    const result = { ...core, artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core) };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(result), "utf8")
        > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxArtifactBytes)
        fail("result is unbounded");
    return deepFreeze(result);
}
async function proposeTaskMapDecomposition(input) {
    if (!plain(input))
        fail("input is invalid");
    exactKeys(input, Object.keys(input).includes("station")
        ? ["workItem", "library", "station"]
        : Object.keys(input).includes("runner") || Object.keys(input).includes("llmModelId")
            ? ["workItem", "library", "runner", "llmModelId"]
            : ["workItem", "library"], "input");
    validateWorkItem(input.workItem);
    validateLibrary(input.library);
    if (input.station !== undefined && (input.runner !== undefined || input.llmModelId !== undefined)) {
        fail("station and replay runner seams are mutually exclusive");
    }
    if (input.runner !== undefined
        && (typeof input.runner !== "function" || !modelId(input.llmModelId))) {
        fail("replay runner requires explicit model provenance");
    }
    const inputDigest = (0, source_contracts_js_1.taskMapContractDigest)(input.workItem);
    const template = input.library.templates.find((candidate) => candidate.domainSignature === input.workItem.domainSignature);
    const idleLlm = {
        invocationState: "not_invoked",
        stationId: exports.TASKMAP_DECOMPOSITION_STATION_ID,
        modelId: null,
        providerId: null,
        transport: null,
        promptDigest: null,
        inputDigest,
        outputDigest: null,
    };
    if (template !== undefined) {
        const subtasks = template.subtasks.map((subtask) => ({
            ...subtask,
            citationPointerIds: [...input.workItem.citationPointerIds],
        }));
        return baseResult(inputDigest, input.library.artifactDigest, "method_library", null, [makeProposal(input.workItem, template.methodId, subtasks, 0)], idleLlm);
    }
    const promptText = promptFor(input.workItem);
    const promptDigest = (0, source_contracts_js_1.taskMapContractDigest)(promptText);
    const request = { stationId: exports.TASKMAP_DECOMPOSITION_STATION_ID, promptText, inputDigest };
    let outputJson;
    let model;
    let provider;
    let transport;
    try {
        if (input.station !== undefined) {
            if (input.station === null || typeof input.station !== "object"
                || Array.isArray(input.station) || !plain(input.station.provider)
                || typeof input.station.run !== "function")
                fail("station seam is invalid");
            exactKeys(input.station.provider, LLM_PROVIDER_KEYS, "station provider");
            if (!validLlmTransport(input.station.provider.transport)
                || (input.station.provider.transport === "gemini-remote"
                    ? input.station.provider.executable !== ""
                    : !boundedText(input.station.provider.executable, exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxIdCharacters))
                || !Array.isArray(input.station.provider.args)
                || (input.station.provider.transport === "gemini-remote"
                    && input.station.provider.args.length !== 0)
                || input.station.provider.args.some((argument) => typeof argument !== "string"
                    || argument.length > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxIdCharacters
                    || CONTROL.test(argument))
                || !modelId(input.station.provider.model))
                fail("station provider is invalid");
            const envelope = await input.station.run(request);
            if (!plain(envelope))
                fail("station envelope is invalid");
            exactKeys(envelope, LLM_ENVELOPE_KEYS, "station envelope");
            if (envelope.stationId !== exports.TASKMAP_DECOMPOSITION_STATION_ID
                || envelope.inputDigest !== inputDigest || envelope.promptDigest !== promptDigest
                || !validLlmTransport(envelope.transport)
                || envelope.transport !== input.station.provider.transport
                || !modelId(envelope.model) || typeof envelope.outputJson !== "string"
                || !validProducedAt(envelope.producedAt))
                fail("station envelope is invalid");
            outputJson = envelope.outputJson;
            model = envelope.model;
            provider = envelope.transport;
            transport = envelope.transport;
        }
        else if (input.runner !== undefined) {
            const replay = await input.runner(request);
            if (!plain(replay))
                fail("replay output is invalid");
            exactKeys(replay, ["outputJson"], "replay output");
            if (typeof replay.outputJson !== "string")
                fail("replay output is invalid");
            outputJson = replay.outputJson;
            model = input.llmModelId;
            provider = "offline-replay";
            transport = "injected-offline";
        }
        else {
            throw new Error("no Station-3 provider");
        }
    }
    catch (error) {
        void error;
        return baseResult(inputDigest, input.library.artifactDigest, "llm_station", "llm_station_unavailable", [], {
            ...idleLlm,
            invocationState: "unavailable",
            promptDigest,
        });
    }
    if (Buffer.byteLength(outputJson, "utf8")
        > exports.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxOutputBytes) {
        return baseResult(inputDigest, input.library.artifactDigest, "llm_station", "llm_station_invalid_output", [], {
            invocationState: "unavailable",
            stationId: exports.TASKMAP_DECOMPOSITION_STATION_ID,
            modelId: model,
            providerId: provider,
            transport,
            promptDigest,
            inputDigest,
            outputDigest: null,
        });
    }
    const outputDigest = (0, source_contracts_js_1.taskMapContractDigest)(outputJson);
    let proposals;
    try {
        proposals = parseOutput(outputJson, input.workItem);
    }
    catch (error) {
        void error;
        return baseResult(inputDigest, input.library.artifactDigest, "llm_station", "llm_station_invalid_output", [], {
            invocationState: "unavailable",
            stationId: exports.TASKMAP_DECOMPOSITION_STATION_ID,
            modelId: model,
            providerId: provider,
            transport,
            promptDigest,
            inputDigest,
            outputDigest,
        });
    }
    return baseResult(inputDigest, input.library.artifactDigest, "llm_station", null, proposals, {
        invocationState: "invoked",
        stationId: exports.TASKMAP_DECOMPOSITION_STATION_ID,
        modelId: model,
        providerId: provider,
        transport,
        promptDigest,
        inputDigest,
        outputDigest,
    });
}
