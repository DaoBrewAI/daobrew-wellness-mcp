import { queryJson } from "../../graph-db.js";
import { EmbeddingProvider } from "../embeddings/provider.js";
import { GraphDelta } from "../reasoner/types.js";
import { readPopulationPrior } from "./priors.js";
import { resolveTransferProvider } from "./records.js";
import { retrieveTransferCandidates, TransferRetrievalResult } from "./retrieve.js";
import { embedTriggerVector } from "./vectors.js";

/**
 * D7 context-only surface. Runs AFTER buildDelta and BEFORE the graph upsert:
 * the reasoner never sees transfer candidates, so gate/verdict/arming influence
 * is impossible by construction — an even stronger guarantee than the
 * memory_context BOUNDARY comment it extends. Attached fields are stable and
 * anonymous: method + outcome_strength + score (+ prior aggregate). Contributor
 * hashes and trigger_text stay server-side.
 */

type Query = (sql: string) => Promise<Record<string, any>[]>;

export interface AttachTransferCandidatesInput {
  delta: GraphDelta;
  userId: string;
  query?: Query;
  /** null = no embedding possible (warn, attach nothing); undefined = resolve Gemini. */
  provider?: EmbeddingProvider | null;
}

export interface AttachTransferCandidatesResult {
  source: TransferRetrievalResult["source"];
  attached: number;
  warnings: string[];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function attachTransferCandidates(
  input: AttachTransferCandidatesInput,
): Promise<AttachTransferCandidatesResult> {
  const query = input.query ?? queryJson;
  const root = input.delta.nodes.find((node) => node.id === input.delta.armed_root_cause.node_id);
  const props = (root?.props_json ?? {}) as Record<string, any>;
  const stressPattern = typeof props.selected_pattern === "string" && props.selected_pattern.trim()
    ? props.selected_pattern
    : null;
  if (!root || !stressPattern) {
    return { source: "none", attached: 0, warnings: [] }; // watching-shaped root — nothing to match on
  }

  const provider = input.provider !== undefined ? input.provider : resolveTransferProvider();
  if (!provider) {
    return { source: "none", attached: 0, warnings: ["transfer retrieval skipped: no embedding provider"] };
  }

  const rootCauseClass = typeof props.root_cause_class === "string" && props.root_cause_class.trim()
    ? props.root_cause_class
    : "productivity";
  const trigger = await embedTriggerVector(provider, {
    stressPattern,
    rootCauseClass,
    contextTerms: stringArray(props.linked_patterns),
  });
  const result = await retrieveTransferCandidates({
    triggerVector: trigger.vector,
    contextBucket: { stress_pattern: stressPattern, root_cause_class: rootCauseClass },
    query,
    readPrior: (pattern) => readPopulationPrior(pattern, query),
  });
  if (result.source === "none") return { source: "none", attached: 0, warnings: [] };

  const memoryContext = (props.memory_context && typeof props.memory_context === "object")
    ? { ...(props.memory_context as Record<string, unknown>) }
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
  } else {
    memoryContext.transfer_prior = result.prior;
  }
  root.props_json = { ...props, memory_context: memoryContext };
  return {
    source: result.source,
    attached: result.source === "transfer_records" ? result.candidates.length : 0,
    warnings: [],
  };
}
