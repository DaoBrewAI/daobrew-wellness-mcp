"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachTransferCandidates = attachTransferCandidates;
const graph_db_js_1 = require("../../graph-db.js");
const priors_js_1 = require("./priors.js");
const records_js_1 = require("./records.js");
const retrieve_js_1 = require("./retrieve.js");
const vectors_js_1 = require("./vectors.js");
function stringArray(value) {
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
async function attachTransferCandidates(input) {
    const query = input.query ?? graph_db_js_1.queryJson;
    const root = input.delta.nodes.find((node) => node.id === input.delta.armed_root_cause.node_id);
    const props = (root?.props_json ?? {});
    const stressPattern = typeof props.selected_pattern === "string" && props.selected_pattern.trim()
        ? props.selected_pattern
        : null;
    if (!root || !stressPattern) {
        return { source: "none", attached: 0, warnings: [] }; // watching-shaped root — nothing to match on
    }
    const provider = input.provider !== undefined ? input.provider : (0, records_js_1.resolveTransferProvider)();
    if (!provider) {
        return { source: "none", attached: 0, warnings: ["transfer retrieval skipped: no embedding provider"] };
    }
    const rootCauseClass = typeof props.root_cause_class === "string" && props.root_cause_class.trim()
        ? props.root_cause_class
        : "productivity";
    const trigger = await (0, vectors_js_1.embedTriggerVector)(provider, {
        stressPattern,
        rootCauseClass,
        contextTerms: stringArray(props.linked_patterns),
    });
    const result = await (0, retrieve_js_1.retrieveTransferCandidates)({
        triggerVector: trigger.vector,
        contextBucket: { stress_pattern: stressPattern, root_cause_class: rootCauseClass },
        query,
        readPrior: (pattern) => (0, priors_js_1.readPopulationPrior)(pattern, query),
    });
    if (result.source === "none")
        return { source: "none", attached: 0, warnings: [] };
    const memoryContext = (props.memory_context && typeof props.memory_context === "object")
        ? { ...props.memory_context }
        : {};
    memoryContext.transfer_source = result.source;
    // Per research doc §5.6, both neighbors and cohort priors are un-transported
    // source priors — downstream copy must never claim more until a real
    // transport model exists; this string is the honesty hook.
    memoryContext.transport_status = "source_prior";
    if (result.source === "transfer_records") {
        memoryContext.transfer_candidates = result.candidates.map((candidate) => ({
            method: candidate.method_json,
            outcome_strength: candidate.outcome_strength,
            score: candidate.score,
        }));
    }
    else {
        memoryContext.transfer_prior = result.prior;
    }
    root.props_json = { ...props, memory_context: memoryContext };
    return {
        source: result.source,
        attached: result.source === "transfer_records" ? result.candidates.length : 0,
        warnings: [],
    };
}
